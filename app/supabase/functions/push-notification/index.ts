import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Metodo non consentito.' });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse(401, { error: 'Autenticazione richiesta.' });

  let payload: { messageId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Richiesta JSON non valida.' });
  }
  if (typeof payload.messageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.messageId)) {
    return jsonResponse(400, { error: 'ID messaggio non valido.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Configurazione Supabase mancante per push-notification.');
    return jsonResponse(500, { error: 'Servizio notifiche non configurato.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse(401, { error: 'Sessione non valida.' });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: message, error: messageError } = await admin.from('messages')
    .select('id,conversation_id,author_id,deleted_at')
    .eq('id', payload.messageId)
    .maybeSingle();
  if (messageError) {
    console.error('Lettura messaggio push:', messageError.message);
    return jsonResponse(500, { error: 'Impossibile verificare il messaggio.' });
  }
  if (!message || message.author_id !== authData.user.id || message.deleted_at) {
    return jsonResponse(403, { error: 'Messaggio non autorizzato o non disponibile.' });
  }

  const [{ data: conversation, error: conversationError }, { data: memberships, error: membershipsError }] = await Promise.all([
    admin.from('conversations').select('id,title,kind').eq('id', message.conversation_id).maybeSingle(),
    admin.from('conversation_members').select('user_id').eq('conversation_id', message.conversation_id),
  ]);
  if (conversationError || membershipsError) {
    console.error('Lettura destinatari push:', conversationError?.message || membershipsError?.message);
    return jsonResponse(500, { error: 'Impossibile verificare i destinatari.' });
  }
  if (!conversation || !memberships?.some(member => member.user_id === authData.user.id)) {
    return jsonResponse(403, { error: 'Non sei membro della conversazione.' });
  }

  let recipientIds = [...new Set(memberships.map(member => member.user_id))]
    .filter(id => id !== authData.user.id);
  if (!recipientIds.length) return jsonResponse(200, { sent: 0 });

  if (conversation.kind === 'dm') {
    const { data: blocks, error: blocksError } = await admin.from('blocks')
      .select('blocker_id,blocked_id')
      .or(`blocker_id.eq.${authData.user.id},blocked_id.eq.${authData.user.id}`);
    if (blocksError) {
      console.error('Verifica blocchi push:', blocksError.message);
      return jsonResponse(500, { error: 'Impossibile verificare le preferenze di blocco.' });
    }
    const blockedIds = new Set((blocks || []).flatMap(block =>
      block.blocker_id === authData.user.id ? [block.blocked_id] :
        block.blocked_id === authData.user.id ? [block.blocker_id] : []));
    recipientIds = recipientIds.filter(id => !blockedIds.has(id));
  }
  if (!recipientIds.length) return jsonResponse(200, { sent: 0 });

  const { data: claimed, error: claimError } = await admin.from('message_push_deliveries')
    .upsert(recipientIds.map(userId => ({ message_id: message.id, user_id: userId })), {
      onConflict: 'message_id,user_id',
      ignoreDuplicates: true,
    })
    .select('user_id');
  if (claimError) {
    console.error('Deduplicazione push:', claimError.message);
    return jsonResponse(500, { error: 'Impossibile preparare le notifiche.' });
  }
  const claimedIds = new Set((claimed || []).map(delivery => delivery.user_id));
  if (!claimedIds.size) return jsonResponse(200, { sent: 0 });

  const [{ data: tokens, error: tokensError }, { data: sender, error: senderError }] = await Promise.all([
    admin.from('expo_push_tokens').select('user_id,expo_push_token').in('user_id', [...claimedIds]),
    admin.from('profiles').select('display_name').eq('id', authData.user.id).maybeSingle(),
  ]);
  if (tokensError || senderError) {
    console.error('Lettura token push:', tokensError?.message || senderError?.message);
    const { error: releaseError } = await admin.from('message_push_deliveries').delete()
      .eq('message_id', message.id).in('user_id', [...claimedIds]);
    if (releaseError) console.error('Rilascio notifiche da ritentare:', releaseError.message);
    return jsonResponse(500, { error: 'Impossibile leggere le registrazioni push.' });
  }
  if (!tokens?.length) return jsonResponse(200, { sent: 0 });

  const title = conversation.kind === 'dm'
    ? sender?.display_name || 'Nuovo messaggio'
    : conversation.title || 'Nuovo messaggio';
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  let sent = 0;
  let failed = 0;

  for (let index = 0; index < tokens.length; index += 100) {
    const batch = tokens.slice(index, index + 100);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    let response: Response;
    try {
      response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map(token => ({
          to: token.expo_push_token,
          sound: 'default',
          title,
          body: 'Hai un nuovo messaggio.',
          data: { type: 'message', conversationId: message.conversation_id },
        }))),
      });
    } catch (error) {
      const { error: releaseError } = await admin.from('message_push_deliveries').delete().eq('message_id', message.id)
        .in('user_id', [...new Set(batch.map(token => token.user_id))]);
      if (releaseError) console.error('Rilascio notifiche da ritentare:', releaseError.message);
      console.error('Connessione al servizio Expo Push:', error);
      return jsonResponse(502, { error: 'Servizio notifiche temporaneamente non raggiungibile.' });
    }

    if (!response.ok) {
      const { error: releaseError } = await admin.from('message_push_deliveries').delete().eq('message_id', message.id)
        .in('user_id', [...new Set(batch.map(token => token.user_id))]);
      if (releaseError) console.error('Rilascio notifiche da ritentare:', releaseError.message);
      console.error('Risposta Expo Push non valida:', response.status);
      return jsonResponse(502, { error: 'Il servizio notifiche ha rifiutato la richiesta.' });
    }

    let result: { data?: { status?: string; details?: { error?: string } }[] };
    try {
      result = await response.json();
    } catch (error) {
      const { error: releaseError } = await admin.from('message_push_deliveries').delete()
        .eq('message_id', message.id).in('user_id', [...new Set(batch.map(token => token.user_id))]);
      if (releaseError) console.error('Rilascio notifiche da ritentare:', releaseError.message);
      console.error('Risposta JSON Expo Push non valida:', error);
      return jsonResponse(502, { error: 'Risposta non valida dal servizio notifiche.' });
    }
    const tickets = Array.isArray(result.data) ? result.data : [];
    if (tickets.length !== batch.length) {
      const { error: releaseError } = await admin.from('message_push_deliveries').delete()
        .eq('message_id', message.id).in('user_id', [...new Set(batch.map(token => token.user_id))]);
      if (releaseError) console.error('Rilascio notifiche da ritentare:', releaseError.message);
      return jsonResponse(502, { error: 'Risposta incompleta dal servizio notifiche.' });
    }
    for (const [ticketIndex, ticket] of tickets.entries()) {
      if (ticket.status === 'ok') {
        sent += 1;
      } else {
        failed += 1;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const { error: deleteError } = await admin.from('expo_push_tokens').delete()
            .eq('expo_push_token', batch[ticketIndex].expo_push_token);
          if (deleteError) console.error('Rimozione token non valido:', deleteError.message);
        }
      }
    }
  }

  return jsonResponse(200, { sent, failed });
});
