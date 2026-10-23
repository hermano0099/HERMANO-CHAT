import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Btn, Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { notifyMessageRecipients } from '../lib/pushNotifications';
import { C } from '../theme/colors';
import type { Conversation, Message, Profile } from '../types/models';

const MEDIA_BUCKET = 'chat-media';
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;
const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};
const MEDIA_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', webm: 'video/webm', m4v: 'video/x-m4v',
  m4a: 'audio/mp4',
};

type ForwardDestination = {
  conversation: Conversation;
  label: string;
};

function formatDuration(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function getQuotedMessagePreview(message: Pick<Message, 'body' | 'media_type'>) {
  const mediaPlaceholder = message.media_type === 'image' ? 'Foto'
    : message.media_type === 'video' ? 'Video'
      : message.media_type === 'audio' ? 'Messaggio vocale' : null;
  return message.body && message.body !== mediaPlaceholder
    ? message.body
    : mediaPlaceholder || message.body || 'Messaggio';
}

function describeVoiceSendError(error: unknown) {
  if (typeof error === 'string') return error;
  if (typeof error !== 'object' || error === null) return 'Errore sconosciuto.';

  const details = error as Record<string, unknown>;
  const message = typeof details.message === 'string' ? details.message : null;
  const fields = [
    ['codice', details.code],
    ['dettagli', details.details],
    ['suggerimento', details.hint],
  ].flatMap(([label, value]) => typeof value === 'string' && value ? [`${label}: ${value}`] : []);
  const description = [message, ...fields].filter(Boolean).join('\n');

  return description || (error instanceof Error ? error.message : 'Errore sconosciuto.');
}

function VideoAttachment({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={styles.mediaVideo} />;
}

function AudioAttachment({ uri, durationMs }: { uri: string; durationMs?: number | null }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const totalDuration = status.duration > 0 ? status.duration : (durationMs || 0) / 1000;

  function togglePlayback() {
    if (status.playing) {
      player.pause();
    } else {
      if (status.didJustFinish) player.seekTo(0);
      player.play();
    }
  }

  return <View style={styles.audioPlayer}>
    <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Metti in pausa il vocale' : 'Ascolta il vocale'}
      onPress={togglePlayback} style={styles.audioControl}>
      <HCText style={styles.audioControlText}>{status.playing ? 'Ⅱ' : '▶'}</HCText>
    </Pressable>
    <View style={styles.audioDetails}>
      <View style={styles.audioTrack}><View style={[styles.audioProgress, { width: `${totalDuration ? Math.min(100, (status.currentTime / totalDuration) * 100) : 0}%` }]} /></View>
      <HCText muted style={styles.audioDuration}>{formatDuration(status.currentTime)} / {formatDuration(totalDuration)}</HCText>
    </View>
  </View>;
}

export function ChatScreen({ conversation, userId }: { conversation: Conversation; userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [forwardSource, setForwardSource] = useState<Message | null>(null);
  const [forwardDestinations, setForwardDestinations] = useState<ForwardDestination[]>([]);
  const [loadingForwardDestinations, setLoadingForwardDestinations] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [invite, setInvite] = useState('');
  const [showActions, setShowActions] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const scroll = useRef<FlatList<Message>>(null);
  const reloadSequence = useRef(0);
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;
  const isChannelMemberReadOnly = conversation.kind === 'channel' && conversation.owner_id !== userId;

  async function notifyAfterSend(messageId: string) {
    try {
      await notifyMessageRecipients(messageId);
    } catch (error) {
      Alert.alert('Messaggio inviato', `Push non consegnata: ${error instanceof Error ? error.message : 'servizio non disponibile.'}`);
    }
  }

  const reload = useCallback(async (search = '') => {
    const sequence = ++reloadSequence.current;
    setLoading(true);
    let request = supabase.from('messages')
      .select('id,conversation_id,author_id,body,created_at,edited_at,deleted_at,forwarded_from_message_id,reply_to_message_id,media_path,media_type,media_duration_ms')
      .eq('conversation_id', conversation.id);
    if (search) request = request.is('deleted_at', null).ilike('body', `%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const { data, error } = await request.order('created_at', { ascending: false }).limit(100);
    if (sequence !== reloadSequence.current) return;
    if (error) {
      Alert.alert('Messaggi', error.message);
      setLoading(false);
      return;
    }
    let next = ((data || []) as Message[]).reverse();
    const replyIds = [...new Set(next.flatMap(message => message.reply_to_message_id ? [message.reply_to_message_id] : []))];
    if (replyIds.length) {
      const { data: replies, error: repliesError } = await supabase.from('messages')
        .select('id,author_id,body,deleted_at,media_type')
        .eq('conversation_id', conversation.id)
        .in('id', replyIds);
      if (repliesError) {
        Alert.alert('Risposte ai messaggi', repliesError.message);
      } else {
        const repliesById = new Map((replies || []).map(reply => [reply.id, reply]));
        next = next.map(message => ({
          ...message,
          reply_to: message.reply_to_message_id ? repliesById.get(message.reply_to_message_id) || null : null,
        }));
      }
      if (sequence !== reloadSequence.current) return;
    }
    const mediaPaths = next.flatMap(message => message.media_path && !message.deleted_at ? [message.media_path] : []);
    if (mediaPaths.length) {
      const { data: signedUrls, error: signedUrlError } = await supabase.storage.from(MEDIA_BUCKET)
        .createSignedUrls(mediaPaths, 60 * 60);
      if (signedUrlError) {
        Alert.alert('Allegati', signedUrlError.message);
      } else {
        const urlsByPath = new Map((signedUrls || []).map(item => [item.path, item.signedUrl]));
        next = next.map(message => ({
          ...message,
          media_url: message.media_path ? urlsByPath.get(message.media_path) || undefined : undefined,
        }));
      }
      if (sequence !== reloadSequence.current) return;
    }
    setMessages(next);
    const ids = [...new Set(next.flatMap(m => [m.author_id, ...(m.reply_to ? [m.reply_to.author_id] : [])]))];
    if (ids.length) {
      const { data: authors, error: authorsError } = await supabase.from('profiles').select('id,display_name').in('id', ids);
      if (authorsError) Alert.alert('Profili dei messaggi', authorsError.message);
      if (sequence !== reloadSequence.current) return;
      setPeople(Object.fromEntries(((authors || []) as Profile[]).map(p => [p.id, p.display_name])));
    }
    setLoading(false);
  }, [conversation.id]);

const markAsRead = useCallback(async () => {
  const { data, error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversation.id)
    .eq('user_id', userId)
    .select('conversation_id')
    .maybeSingle();

  if (error) {
    Alert.alert('Lettura chat', error.message);
  } else if (!data) {
    Alert.alert('Lettura chat', 'Non risulta una membership per questa conversazione.');
  }
}, [conversation.id, userId]);

const reloadAndMarkAsRead = useCallback(async () => {
  await reload(searchTermRef.current.trim());
  await markAsRead();
}, [markAsRead, reload]);

function refreshAfterSend() {
  void Promise.all([markAsRead(), reload()]).catch(error => {
    Alert.alert('Aggiornamento chat', error instanceof Error ? error.message : 'Non è stato possibile aggiornare la conversazione.');
  });
}

useEffect(() => {
  reloadAndMarkAsRead();

  const channel = supabase.channel(`conversation-${conversation.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, reloadAndMarkAsRead)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, () => reload(searchTermRef.current.trim()))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, () => reload(searchTermRef.current.trim()))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [conversation.id, reload, reloadAndMarkAsRead]);

useEffect(() => {
  const timer = setTimeout(() => reload(searchTerm.trim()), 250);
  return () => clearTimeout(timer);
}, [reload, searchTerm]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > 4000) { Alert.alert('Testo troppo lungo', 'Massimo 4000 caratteri.'); return; }
    setSending(true);
    try {
      let sentMessageId: string | null = null;
      if (editingMessage) {
        const { error } = await supabase.from('messages').update({ body }).eq('id', editingMessage.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('messages').insert({
          conversation_id: conversation.id,
          author_id: userId,
          body,
          reply_to_message_id: replyTo?.id ?? null,
        }).select('id').single();
        if (error) throw error;
        sentMessageId = data.id;
      }
      setDraft('');
      setReplyTo(null);
      setEditingMessage(null);
      if (sentMessageId) void notifyAfterSend(sentMessageId);
      refreshAfterSend();
    } catch (error) {
      Alert.alert(
        editingMessage ? 'Modifica non salvata' : 'Messaggio non inviato',
        error instanceof Error ? error.message : 'Si è verificato un errore durante l’invio.'
      );
    } finally {
      setSending(false);
    }
  }

  function chooseAttachment() {
    if (sending) return;
    Alert.alert('Invia un allegato', 'Scegli cosa vuoi inviare.', [
      { text: 'Foto', onPress: () => pickMedia('images') },
      { text: 'Video', onPress: () => pickMedia('videos') },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }

  async function pickMedia(mediaType: 'images' | 'videos') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: [mediaType],
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset) {
        Alert.alert('Allegato non disponibile', 'Non è stato possibile leggere il file selezionato.');
        return;
      }
      if (asset.fileSize && asset.fileSize > MAX_MEDIA_SIZE) {
        Alert.alert('File troppo grande', 'Foto e video possono pesare al massimo 50 MB.');
        return;
      }

      const mediaTypeForMessage = mediaType === 'images' ? 'image' : 'video';
      const mimeType = asset.mimeType || (mediaTypeForMessage === 'image' ? 'image/jpeg' : 'video/mp4');
      const extension = MEDIA_EXTENSIONS[mimeType];
      if (!extension) {
        Alert.alert('Formato non supportato', 'Seleziona una foto JPG, PNG, WebP, HEIC oppure un video MP4, MOV, 3GP o WebM.');
        return;
      }

      setSending(true);
      const path = `${conversation.id}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const file = await fetch(asset.uri);
      if (!file.ok) throw new Error('Non è stato possibile leggere il file selezionato.');
      const fileData = await file.arrayBuffer();
      if (!fileData.byteLength) throw new Error('Il file selezionato è vuoto.');
      if (fileData.byteLength > MAX_MEDIA_SIZE) {
        throw new Error('Foto e video possono pesare al massimo 50 MB.');
      }

      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, fileData, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: sentMessage, error: messageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        author_id: userId,
        body: draft.trim() || (mediaTypeForMessage === 'image' ? 'Foto' : 'Video'),
        media_path: path,
        media_type: mediaTypeForMessage,
        reply_to_message_id: replyTo?.id ?? null,
      }).select('id').single();
      if (messageError) {
        const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        if (cleanupError) {
          throw new Error(`${messageError.message} Inoltre non è stato possibile eliminare il file caricato: ${cleanupError.message}`);
        }
        throw messageError;
      }

      void notifyAfterSend(sentMessage.id);
      setDraft('');
      setReplyTo(null);
      refreshAfterSend();
    } catch (error) {
      Alert.alert('Allegato non inviato', error instanceof Error ? error.message : 'Si è verificato un errore durante l’invio.');
    } finally {
      setSending(false);
    }
  }

  async function startVoiceRecording() {
    if (sending || recording) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microfono non autorizzato', 'Consenti l’accesso al microfono nelle impostazioni per registrare un vocale.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceUri(null);
      setVoiceDurationMs(0);
      setRecording(true);
    } catch (error) {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch (audioModeError) {
        Alert.alert('Audio non disponibile', audioModeError instanceof Error ? audioModeError.message : 'Non è stato possibile ripristinare l’audio.');
      }
      Alert.alert('Registrazione non avviata', error instanceof Error ? error.message : 'Si è verificato un errore durante l’avvio della registrazione.');
    }
  }

  async function stopVoiceRecording() {
    if (!recording) return;
    try {
      const elapsedBeforeStop = recorder.getStatus().durationMillis;
      await recorder.stop();
      const uri = recorder.uri;
      const durationMs = Math.max(elapsedBeforeStop, recorder.getStatus().durationMillis);
      if (!uri || durationMs <= 0) throw new Error('La registrazione è vuota o non disponibile.');
      setVoiceUri(uri);
      setVoiceDurationMs(durationMs);
    } catch (error) {
      Alert.alert('Registrazione non disponibile', error instanceof Error ? error.message : 'Non è stato possibile completare la registrazione.');
    } finally {
      setRecording(false);
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch (error) {
        Alert.alert('Audio non disponibile', error instanceof Error ? error.message : 'Non è stato possibile ripristinare l’audio.');
      }
    }
  }

  function discardVoiceRecording() {
    setVoiceUri(null);
    setVoiceDurationMs(0);
  }

  async function sendVoiceMessage() {
    if (!voiceUri || sending) return;
    setSending(true);
    let stage = 'lettura della registrazione';
    try {
      const file = await fetch(voiceUri);
      if (!file.ok) throw new Error('Non è stato possibile leggere la registrazione.');
      const fileData = await file.arrayBuffer();
      if (!fileData.byteLength) throw new Error('La registrazione è vuota.');
      if (fileData.byteLength > MAX_MEDIA_SIZE) throw new Error('Il vocale supera il limite di 50 MB.');

      const isWebRecording = Platform.OS === 'web';
      const extension = isWebRecording ? 'webm' : 'm4a';
      const mimeType = isWebRecording ? 'audio/webm' : 'audio/mp4';
      const path = `${conversation.id}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      stage = `upload Storage (${MEDIA_BUCKET}, ${mimeType}, ${path})`;
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, fileData, {
        contentType: mimeType,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      stage = 'inserimento del messaggio nel database';
      const { data: sentMessage, error: messageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        author_id: userId,
        body: 'Messaggio vocale',
        media_path: path,
        media_type: 'audio',
        media_duration_ms: Math.max(1, Math.round(voiceDurationMs)),
        reply_to_message_id: replyTo?.id ?? null,
      }).select('id').single();
      if (messageError) {
        const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
        if (cleanupError) {
          throw new Error(`${messageError.message} Inoltre non è stato possibile eliminare il file caricato: ${cleanupError.message}`);
        }
        throw messageError;
      }

      void notifyAfterSend(sentMessage.id);
      discardVoiceRecording();
      setReplyTo(null);
      refreshAfterSend();
    } catch (error) {
      Alert.alert('Vocale non inviato', `${stage}:\n${describeVoiceSendError(error)}`);
    } finally {
      setSending(false);
    }
  }

  function editMessage(message: Message) {
    if (message.author_id !== userId || message.deleted_at || isChannelMemberReadOnly) return;
    setEditingMessage(message);
    setReplyTo(null);
    setDraft(message.body);
  }

  function deleteMessage(message: Message) {
    Alert.alert(
      'Elimina messaggio',
      'Il messaggio verrà nascosto nella chat, ma il contenuto originale resterà conservato.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('messages')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', message.id);
            if (error) {
              Alert.alert('Eliminazione non riuscita', error.message);
              return;
            }
            await reload();
          },
        },
      ]
    );
  }

  async function openForward(message: Message) {
    setForwardSource(message);
    setForwardDestinations([]);
    setLoadingForwardDestinations(true);
    try {
      const { data: memberships, error: membershipError } = await supabase.from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (membershipError) throw membershipError;

      const ids = [...new Set((memberships || []).map(item => item.conversation_id))]
        .filter(id => id !== conversation.id);
      if (!ids.length) return;

      const [{ data: conversations, error: conversationsError }, { data: members, error: membersError }] = await Promise.all([
        supabase.from('conversations').select('*').in('id', ids),
        supabase.from('conversation_members').select('conversation_id,user_id').in('conversation_id', ids),
      ]);
      if (conversationsError || membersError) throw conversationsError || membersError;

      const otherIds = [...new Set((members || []).filter(item => item.user_id !== userId).map(item => item.user_id))];
      const { data: profiles, error: profilesError } = otherIds.length
        ? await supabase.from('profiles').select('id,display_name').in('id', otherIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const names = new Map((profiles || []).map(profile => [profile.id, profile.display_name]));
      const destinations = ((conversations || []) as Conversation[])
        .filter(item => item.kind !== 'channel' || item.owner_id === userId)
        .map(item => {
          const otherId = (members || []).find(member =>
            member.conversation_id === item.id && member.user_id !== userId
          )?.user_id;
          return {
            conversation: item,
            label: item.kind === 'dm' ? names.get(otherId || '') || 'Chat privata' : item.title,
          };
        });
      setForwardDestinations(destinations);
    } catch (error) {
      setForwardSource(null);
      Alert.alert('Inoltro non disponibile', error instanceof Error ? error.message : 'Si è verificato un errore.');
    } finally {
      setLoadingForwardDestinations(false);
    }
  }

  async function forwardMessage(destination: ForwardDestination) {
    if (!forwardSource || forwarding) return;
    setForwarding(true);
    let copiedMediaPath: string | null = null;
    try {
      if (forwardSource.media_path && forwardSource.media_type) {
        const { data: file, error: downloadError } = await supabase.storage.from(MEDIA_BUCKET)
          .download(forwardSource.media_path);
        if (downloadError) throw downloadError;
        if (!file || file.size <= 0) throw new Error('L’allegato originale è vuoto o non disponibile.');
        if (file.size > MAX_MEDIA_SIZE) throw new Error('L’allegato supera il limite di 50 MB.');

        const extension = forwardSource.media_path.split('.').pop()?.toLowerCase() || '';
        const contentType = extension === 'webm' && forwardSource.media_type === 'audio'
          ? 'audio/webm'
          : MEDIA_MIME_TYPES[extension]
          || (forwardSource.media_type === 'audio' ? 'audio/mp4' : forwardSource.media_type === 'image' ? 'image/jpeg' : 'video/mp4');
        copiedMediaPath = `${destination.conversation.id}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension || 'bin'}`;
        const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(copiedMediaPath, file, {
          contentType,
          upsert: false,
        });
        if (uploadError) throw uploadError;
      }

      const { data: sentMessage, error } = await supabase.from('messages').insert({
        conversation_id: destination.conversation.id,
        author_id: userId,
        body: forwardSource.body,
        media_path: copiedMediaPath,
        media_type: forwardSource.media_type,
        media_duration_ms: forwardSource.media_duration_ms,
        forwarded_from_message_id: forwardSource.id,
      }).select('id').single();
      if (error) {
        if (copiedMediaPath) {
          const { error: cleanupError } = await supabase.storage.from(MEDIA_BUCKET).remove([copiedMediaPath]);
          if (cleanupError) throw new Error(`${error.message} Inoltre non è stato possibile rimuovere il nuovo allegato non associato: ${cleanupError.message}`);
        }
        throw error;
      }
      void notifyAfterSend(sentMessage.id);
      setForwardSource(null);
      Alert.alert('Messaggio inoltrato', `Inviato a ${destination.label}.`);
    } catch (error) {
      Alert.alert('Inoltro non riuscito', error instanceof Error ? error.message : 'Si è verificato un errore.');
    } finally {
      setForwarding(false);
    }
  }

  function showMessageActions(message: Message) {
    if (message.deleted_at) return;
    const actions = message.author_id === userId
      ? [
        ...(!isChannelMemberReadOnly ? [
          { text: 'Modifica', onPress: () => editMessage(message) },
          { text: 'Elimina', style: 'destructive' as const, onPress: () => deleteMessage(message) },
        ] : []),
        { text: 'Inoltra', onPress: () => { void openForward(message); } },
      ]
      : [
        { text: 'Inoltra', onPress: () => { void openForward(message); } },
        { text: 'Segnala', onPress: () => { void reportMessage(message); } },
      ];
    Alert.alert('Azioni messaggio', undefined, actions);
  }

  async function inviteMember() {
    if (conversation.owner_id !== userId) return;
    const name = invite.trim().replace(/^@/, '').toLowerCase();
    if (!name) return;
    const { data: found, error: lookupError } = await supabase.from('profiles').select('id,username').eq('username', name).maybeSingle();
    if (lookupError) { Alert.alert('Ricerca utente', lookupError.message); return; }
    if (!found) { Alert.alert('Utente non trovato', 'Cerca il nome utente esatto, senza spazi.'); return; }
    if (conversation.is_public) {
      const { error } = await supabase.from('conversation_members')
        .insert({ conversation_id: conversation.id, user_id: found.id, role: 'member' });
      if (error) Alert.alert('Aggiunta non riuscita', error.message);
      else { setInvite(''); Alert.alert('Utente aggiunto', `@${found.username} è ora membro.`); }
      return;
    }
    const { error } = await supabase.from('conversation_invitations').insert({
      conversation_id: conversation.id,
      invited_user_id: found.id,
      invited_by: userId,
    });
    if (error) Alert.alert('Invito non riuscito', error.message);
    else { setInvite(''); Alert.alert('Invito inviato', `@${found.username} dovrà accettare prima di entrare.`); }
  }

  async function reportMessage(message: Message) {
    Alert.alert('Segnala messaggio', 'Inviare una segnalazione al team?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Segnala', onPress: async () => {
        const { error } = await supabase.from('reports').insert({ reporter_id: userId, target_user_id: message.author_id, target_message_id: message.id, reason: 'Messaggio segnalato dall’utente. Da verificare.' });
        Alert.alert(error ? 'Errore' : 'Segnalazione ricevuta', error?.message || 'Il team potrà esaminare il messaggio.');
      } },
    ]);
  }

  async function blockParticipant() {
    if (conversation.kind !== 'dm') return;
    const { data: members, error } = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conversation.id);
    if (error) { Alert.alert('Errore', error.message); return; }
    const other = (members || []).find(m => m.user_id !== userId)?.user_id;
    if (!other) return;
    const result = await supabase.from('blocks').upsert({ blocker_id: userId, blocked_id: other }, { onConflict: 'blocker_id,blocked_id' });
    Alert.alert(result.error ? 'Errore' : 'Utente bloccato', result.error?.message || 'Non potrete più scambiarvi messaggi.');
  }

  return <>
  <KeyboardAvoidingView style={styles.main} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={85}>
    <View style={styles.summary}><HCText muted>{conversation.kind === 'dm' ? 'Chat privata' : conversation.kind === 'group' ? 'Gruppo' : 'Canale'} · {conversation.is_public ? 'Pubblico' : 'Privato'}</HCText>
      <Pressable onPress={() => setShowActions(x => !x)}><HCText style={{ color: C.blue2 }}>Opzioni  ⋮</HCText></Pressable>
    </View>
    {showActions && <View style={styles.actions}>
      {conversation.owner_id === userId && <>
        <HCText>{conversation.is_public ? 'Aggiungi tramite username (senza @)' : 'Invita tramite username (senza @)'}</HCText>
        <Field placeholder="nomeutente" autoCapitalize="none" value={invite} onChangeText={setInvite} />
        <Btn label={conversation.is_public ? 'Aggiungi membro' : 'Invia invito'} onPress={inviteMember} />
      </>}
      {conversation.kind === 'dm' && <Btn danger label="Blocca utente" onPress={blockParticipant} />}
      <HCText muted style={{ fontSize: 12 }}>Per segnalare un messaggio, tieni premuto sul fumetto.</HCText>
    </View>}
    <View style={styles.search}>
      <Field value={searchTerm} onChangeText={setSearchTerm} placeholder="Cerca nei messaggi..." returnKeyType="search" />
      {searchTerm.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Cancella ricerca"
        onPress={() => setSearchTerm('')} style={styles.searchClear}><HCText>✕</HCText></Pressable>}
    </View>
    {loading && <ActivityIndicator color={C.blue2} />}
    <FlatList ref={scroll} data={messages} keyExtractor={m => m.id}
      contentContainerStyle={{ paddingHorizontal: 15, paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' }}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      ListEmptyComponent={!loading ? <Empty message={searchTerm.trim() ? 'Nessun messaggio trovato.' : 'Nessun messaggio. Scrivi il primo!'} /> : null}
      renderItem={({ item }) => {
        const mine = item.author_id === userId;
        const placeholder = item.media_type === 'image' ? 'Foto' : item.media_type === 'audio' ? 'Messaggio vocale' : 'Video';
        return <Pressable onLongPress={() => showMessageActions(item)} style={[styles.bubble, mine ? styles.mine : styles.theirs, item.deleted_at && styles.deletedBubble]}>
          {!mine && conversation.kind !== 'dm' && <HCText style={styles.author}>{people[item.author_id] || 'Utente'}</HCText>}
          {item.forwarded_from_message_id && !item.deleted_at && <HCText muted style={styles.forwardedLabel}>Inoltrato</HCText>}
          {item.reply_to && !item.deleted_at && <View style={styles.quotedMessage}>
            <HCText style={styles.quotedAuthor}>
              {people[item.reply_to.author_id] || (item.reply_to.author_id === userId ? 'Tu' : 'Utente')}
            </HCText>
            <HCText numberOfLines={2} style={styles.quotedText}>
              {item.reply_to.deleted_at ? 'Messaggio eliminato' : getQuotedMessagePreview(item.reply_to)}
            </HCText>
          </View>}
          {item.deleted_at
            ? <HCText muted style={styles.deletedText}>Messaggio eliminato</HCText>
            : item.media_path && item.media_type && item.media_url
            ? item.media_type === 'image'
            ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Apri immagine a schermo intero"
                onPress={() => setFullscreenImage(item.media_url!)}>
                <Image source={{ uri: item.media_url }} resizeMode="contain" style={styles.mediaImage} />
              </Pressable>
            )
              : item.media_type === 'video'
                ? <VideoAttachment uri={item.media_url} />
                : <AudioAttachment uri={item.media_url} durationMs={item.media_duration_ms} />
            : item.media_path
              ? <HCText muted>Allegato non disponibile</HCText>
              : null}
          {!item.deleted_at && (!item.media_path || item.body !== placeholder) && <HCText style={styles.body}>{item.body}</HCText>}
          {item.edited_at && !item.deleted_at && <HCText muted style={styles.editedLabel}>Modificato</HCText>}
          {!isChannelMemberReadOnly && !item.deleted_at && <Pressable accessibilityRole="button" accessibilityLabel="Rispondi a questo messaggio"
            disabled={sending} onPress={() => setReplyTo(item)} style={styles.replyAction}>
            <HCText style={styles.replyActionText}>Rispondi</HCText>
          </Pressable>}
          <HCText muted style={{ fontSize: 10, textAlign: 'right', marginTop: 3 }}>{new Date(item.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</HCText>
        </Pressable>;
      }} />
    {!isChannelMemberReadOnly && (replyTo || editingMessage) && <View style={styles.replyComposer}>
      <View style={styles.replyComposerAccent} />
      <View style={styles.replyComposerContent}>
        <HCText style={styles.quotedAuthor}>{editingMessage ? 'Modifica messaggio' : 'Rispondi a'}</HCText>
        <HCText numberOfLines={2} style={styles.quotedText}>
          {editingMessage ? editingMessage.body : replyTo ? getQuotedMessagePreview(replyTo) : ''}
        </HCText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Annulla risposta o modifica" onPress={() => {
        setReplyTo(null);
        setEditingMessage(null);
        setDraft('');
      }}
        style={styles.replyCancel}><HCText>✕</HCText></Pressable>
    </View>}
    {isChannelMemberReadOnly ? <View style={styles.input}><HCText muted>Solo il proprietario del canale può pubblicare.</HCText></View>
      : recording
        ? <View style={styles.input}>
            <View style={styles.recordingStatus}><View style={styles.recordingDot} /><HCText>Registrazione · {formatDuration(recorderState.durationMillis / 1000)}</HCText></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Annulla registrazione" onPress={async () => { await stopVoiceRecording(); discardVoiceRecording(); }}
              style={styles.voiceSecondary}><HCText>✕</HCText></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Termina registrazione" onPress={stopVoiceRecording} style={styles.voicePrimary}><HCText>■</HCText></Pressable>
          </View>
        : editingMessage
          ? <View style={styles.input}>
              <View style={{ flex: 1 }}>
                <Field placeholder="Modifica il messaggio..." value={draft} onChangeText={setDraft} multiline maxLength={4000} style={{ maxHeight: 130, marginBottom: 0 }} />
              </View>
              <Pressable disabled={sending || !draft.trim()} onPress={send} style={[styles.send, (sending || !draft.trim()) && { opacity: .5 }]}>
                <HCText style={{ fontWeight: '900', fontSize: 19 }}>✓</HCText>
              </Pressable>
            </View>
        : voiceUri
          ? <View style={[styles.input, styles.voicePreview]}>
              <View style={{ flex: 1 }}><AudioAttachment uri={voiceUri} durationMs={voiceDurationMs} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Elimina vocale" disabled={sending} onPress={discardVoiceRecording}
                style={styles.voiceSecondary}><HCText>✕</HCText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Invia vocale" disabled={sending} onPress={sendVoiceMessage}
                style={[styles.voicePrimary, sending && { opacity: .5 }]}>{sending ? <ActivityIndicator color={C.white} /> : <HCText>➤</HCText>}</Pressable>
            </View>
          : <View style={styles.input}>
              <Pressable accessibilityRole="button" accessibilityLabel="Aggiungi foto o video" disabled={sending}
                onPress={chooseAttachment} style={[styles.attach, sending && { opacity: .5 }]}><HCText style={{ fontSize: 22, fontWeight: '800' }}>＋</HCText></Pressable>
              <View style={{ flex: 1 }}><Field placeholder="Scrivi un messaggio..." value={draft} onChangeText={setDraft} multiline maxLength={4000} style={{ maxHeight: 130, marginBottom: 0 }} /></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Registra un messaggio vocale" disabled={sending}
                onPress={startVoiceRecording} style={[styles.mic, sending && { opacity: .5 }]}><HCText style={{ fontSize: 19 }}>🎙</HCText></Pressable>
              <Pressable disabled={sending || !draft.trim()} onPress={send} style={[styles.send, (sending || !draft.trim()) && { opacity: .5 }]}><HCText style={{ fontWeight: '900', fontSize: 19 }}>➤</HCText></Pressable>
            </View>}
  </KeyboardAvoidingView>
  <Modal visible={!!forwardSource} transparent animationType="fade" onRequestClose={() => forwarding ? undefined : setForwardSource(null)}>
    <View style={styles.modalBackdrop}>
      <View style={styles.forwardCard}>
        <View style={styles.forwardHeader}>
          <HCText style={{ fontSize: 18, fontWeight: '900' }}>Inoltra a...</HCText>
          <Pressable accessibilityRole="button" accessibilityLabel="Chiudi" disabled={forwarding}
            onPress={() => setForwardSource(null)}><HCText style={{ fontSize: 20 }}>✕</HCText></Pressable>
        </View>
        {loadingForwardDestinations
          ? <ActivityIndicator color={C.blue2} style={{ margin: 20 }} />
          : <FlatList data={forwardDestinations} keyExtractor={item => item.conversation.id}
              ListEmptyComponent={<Empty message="Non ci sono altre chat disponibili per l’inoltro." />}
              renderItem={({ item }) => <Pressable disabled={forwarding} onPress={() => forwardMessage(item)} style={styles.destination}>
                <View style={styles.forwardAvatar}><HCText style={{ fontWeight: '900' }}>{item.label.slice(0, 1).toUpperCase()}</HCText></View>
                <View style={{ flex: 1 }}>
                  <HCText style={{ fontWeight: '800' }}>{item.label}</HCText>
                  <HCText muted style={{ fontSize: 12 }}>{item.conversation.kind === 'dm' ? 'Chat privata' : item.conversation.kind === 'group' ? 'Gruppo' : 'Canale'}</HCText>
                </View>
                {forwarding && <ActivityIndicator color={C.blue2} />}
              </Pressable>}
            />}
      </View>
    </View>
  </Modal>
  <Modal visible={!!fullscreenImage} animationType="fade" onRequestClose={() => setFullscreenImage(null)}>
    <View style={styles.fullscreenContainer}>
      {fullscreenImage && <Image source={{ uri: fullscreenImage }} resizeMode="contain" style={styles.fullscreenImage} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Chiudi immagine a schermo intero"
        onPress={() => setFullscreenImage(null)} style={styles.fullscreenClose}>
        <HCText style={styles.fullscreenCloseText}>✕</HCText>
      </Pressable>
    </View>
  </Modal>
  </>;
}
const styles = StyleSheet.create({
  main: { flex: 1 }, summary: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 17, borderBottomWidth: 1, borderColor: C.border },
  search: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 9, gap: 8 },
  searchClear: { padding: 8, marginTop: -10 },
  bubble: { maxWidth: '82%', minWidth: 86, marginVertical: 5, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  mine: { backgroundColor: C.blue, alignSelf: 'flex-end', borderBottomRightRadius: 3 },
  theirs: { backgroundColor: C.panel2, alignSelf: 'flex-start', borderBottomLeftRadius: 3 },
  deletedBubble: { opacity: 0.75 },
  deletedText: { fontStyle: 'italic' },
  forwardedLabel: { fontSize: 11, marginBottom: 5, fontStyle: 'italic' },
  editedLabel: { fontSize: 10, textAlign: 'right', marginTop: 3 },
  quotedMessage: { paddingHorizontal: 9, paddingVertical: 6, marginBottom: 7, borderLeftWidth: 3, borderLeftColor: C.green, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 5 },
  quotedAuthor: { color: C.green, fontSize: 12, fontWeight: '800' },
  quotedText: { fontSize: 13 },
  replyAction: { alignSelf: 'flex-end', paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4 },
  replyActionText: { color: C.green, fontSize: 12, fontWeight: '800' },
  replyComposer: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.panel2 },
  replyComposerAccent: { width: 3, alignSelf: 'stretch', backgroundColor: C.blue2, borderRadius: 2 },
  replyComposerContent: { flex: 1, gap: 2 },
  replyCancel: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: C.panel },
  author: { color: C.green, fontWeight: '800', fontSize: 12, marginBottom: 4 }, body: { fontSize: 16, lineHeight: 22 },
  input: { borderTopWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: C.panel },
  attach: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.panel2 },
  mic: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: C.panel2 },
  send: { paddingHorizontal: 16, paddingVertical: 11, backgroundColor: C.blue, borderRadius: 14 },
  mediaImage: { width: 250, height: 220, borderRadius: 12, backgroundColor: C.panel },
  fullscreenContainer: { flex: 1, backgroundColor: '#000000' },
  fullscreenImage: { width: '100%', height: '100%' },
  fullscreenClose: { position: 'absolute', top: 48, right: 20, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)' },
  fullscreenCloseText: { color: C.white, fontSize: 24, fontWeight: '700' },
  mediaVideo: { width: 250, height: 220, borderRadius: 12, backgroundColor: '#000000' },
  audioPlayer: { width: 250, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  audioControl: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: C.blue2 },
  audioControlText: { color: C.white, fontSize: 19, fontWeight: '900' },
  audioDetails: { flex: 1, gap: 5 },
  audioTrack: { height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: C.border },
  audioProgress: { height: 4, borderRadius: 2, backgroundColor: C.green },
  audioDuration: { fontSize: 11 },
  recordingStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F04452' },
  voiceSecondary: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: C.panel2 },
  voicePrimary: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: C.blue },
  voicePreview: { paddingVertical: 8 },
  actions: { padding: 13, backgroundColor: C.panel, borderBottomWidth: 1, borderColor: C.border },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  forwardCard: { maxHeight: '80%', borderRadius: 18, padding: 16, backgroundColor: C.panel },
  forwardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomColor: C.border, borderBottomWidth: 1 },
  forwardAvatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomColor: C.border, borderBottomWidth: 1 },
});
