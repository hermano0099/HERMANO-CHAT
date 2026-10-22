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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Configurazione Supabase mancante per delete-account.');
    return jsonResponse(500, { error: 'Servizio di eliminazione account non configurato.' });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) return jsonResponse(401, { error: 'Sessione non valida.' });

  const lastSignIn = Date.parse(authData.user.last_sign_in_at || '');
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > 15 * 60 * 1000) {
    return jsonResponse(403, { error: 'Per eliminare l’account è richiesta una nuova verifica della password.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ownedConversations, error: conversationsError } = await admin
    .from('conversations')
    .select('id')
    .eq('owner_id', authData.user.id);
  if (conversationsError) {
    console.error('Lettura conversazioni per eliminazione account:', conversationsError.message);
    return jsonResponse(500, { error: 'Impossibile preparare l’eliminazione dei file.' });
  }

  const conversationsToDelete: string[] = [];
  for (const conversation of ownedConversations || []) {
    const { data: otherMembers, error: membersError } = await admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversation.id)
      .neq('user_id', authData.user.id)
      .limit(1);
    if (membersError) {
      console.error('Lettura membri per eliminazione account:', membersError.message);
      return jsonResponse(500, { error: 'Impossibile preparare l’eliminazione dei file.' });
    }
    if (!otherMembers?.length) conversationsToDelete.push(conversation.id);
  }

  const mediaPaths = new Set<string>();
  const collectMediaPaths = async (column: 'author_id' | 'conversation_id', value: string) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.from('messages')
        .select('id,media_path')
        .not('media_path', 'is', null)
        .eq(column, value)
        .order('id')
        .range(offset, offset + 999);
      if (error) return error;
      for (const message of data || []) {
        if (typeof message.media_path === 'string') mediaPaths.add(message.media_path);
      }
      if (!data || data.length < 1000) return null;
    }
  };

  const ownMediaError = await collectMediaPaths('author_id', authData.user.id);
  if (ownMediaError) {
    console.error('Lettura allegati account:', ownMediaError.message);
    return jsonResponse(500, { error: 'Impossibile preparare l’eliminazione dei file.' });
  }
  for (const conversationId of conversationsToDelete) {
    const conversationMediaError = await collectMediaPaths('conversation_id', conversationId);
    if (conversationMediaError) {
      console.error('Lettura allegati conversazione da eliminare:', conversationMediaError.message);
      return jsonResponse(500, { error: 'Impossibile preparare l’eliminazione dei file.' });
    }
  }

  const paths = [...mediaPaths];
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await admin.storage.from('chat-media').remove(paths.slice(index, index + 100));
    if (error) {
      console.error('Eliminazione allegati account:', error.message);
      return jsonResponse(500, {
        error: 'Non è stato possibile eliminare tutti gli allegati. L’account non è stato eliminato; riprova.',
      });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(authData.user.id);
  if (deleteError) {
    console.error('Eliminazione account Auth:', deleteError.message);
    return jsonResponse(500, {
      error: 'I file allegati sono stati rimossi, ma l’account non è stato eliminato. Contatta l’assistenza.',
    });
  }

  return jsonResponse(200, { deleted: true });
});
