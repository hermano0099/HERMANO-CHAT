import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { Btn, HCText } from './src/components/UI';
import { configured, supabase } from './src/lib/supabase';
import { AuthScreen } from './src/screens/AuthScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { CreateConversationScreen } from './src/screens/CreateConversationScreen';
import { MapScreen } from './src/screens/MapScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { C } from './src/theme/colors';
import type { Conversation, Profile } from './src/types/models';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Tab = 'chats' | 'discover' | 'map' | 'profile';
type Page = Tab | 'chat' | 'create' | 'admin' | 'privacy';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>('chats');
  const [page, setPage] = useState<Page>('chats');
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadRequestSequence = useRef(0);
  const handledNotificationResponses = useRef(new Set<string>());
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [chatTitle, setChatTitle] = useState('');

  useEffect(() => {
    if (!configured) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) { setProfile(null); setIsAdmin(false); setPage('chats'); setTab('chats'); }
    });
    return () => { listener.subscription.unsubscribe(); };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session?.user.id) return;
    const [{ data: p, error }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name').eq('id', session.user.id).maybeSingle(),
      supabase.from('app_admins').select('user_id').eq('user_id', session.user.id).maybeSingle(),
    ]);
    if (error) console.warn('Profilo:', error.message);
    setProfile(p as Profile | null);
    setIsAdmin(!!a);
  }, [session?.user.id]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  const refreshUnreadNotifications = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    const sequence = ++unreadRequestSequence.current;
    const { data: memberships, error: membershipsError } = await supabase.from('conversation_members')
      .select('conversation_id,last_read_at')
      .eq('user_id', userId);
    if (membershipsError) {
      console.warn('Notifiche non aggiornate:', membershipsError.message);
      return;
    }
    const results = await Promise.all((memberships || []).map(async membership => {
      let request = supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('conversation_id', membership.conversation_id)
        .neq('author_id', userId)
        .is('deleted_at', null);
      if (membership.last_read_at) request = request.gt('created_at', membership.last_read_at);
      return request;
    }));
    const failed = results.find(result => result.error);
    if (failed?.error) {
      console.warn('Notifiche non aggiornate:', failed.error.message);
      return;
    }
    const { count: invitationCount, error: invitationsError } = await supabase.from('conversation_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('invited_user_id', userId)
      .eq('status', 'pending');
    if (invitationsError) {
      console.warn('Inviti non aggiornati:', invitationsError.message);
      return;
    }
    if (sequence !== unreadRequestSequence.current) return;
    setUnreadCount(results.reduce((total, result) => total + (result.count || 0), 0) + (invitationCount || 0));
  }, [session?.user.id]);

  const handlePushResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    if (!session?.user.id) return;
    const responseId = response.notification.request.identifier;
    if (handledNotificationResponses.current.has(responseId)) return;
    handledNotificationResponses.current.add(responseId);
    try {
      const data = response.notification.request.content.data || {};
      if (data.type === 'invitation') {
        setTab('chats');
        setPage('chats');
        return;
      }
      if (typeof data.conversationId !== 'string') return;
      const { data: found, error } = await supabase.from('conversations').select('*')
        .eq('id', data.conversationId).maybeSingle();
      if (error || !found) {
        Alert.alert('Notifica', error?.message || 'La conversazione non è più disponibile.');
        return;
      }
      const conv = found as Conversation;
      setConversation(conv);
      setChatTitle(conv.kind === 'dm' ? 'Messaggi' : conv.title);
      setTab('chats');
      setPage('chat');
    } finally {
      try {
        await Notifications.clearLastNotificationResponseAsync();
      } catch (error) {
        console.warn('Pulizia notifica aperta:', error instanceof Error ? error.message : error);
      }
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    const listener = Notifications.addNotificationResponseReceivedListener(response => {
      void handlePushResponse(response);
    });
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (active && response) void handlePushResponse(response);
    }).catch(error => {
      console.warn('Apertura notifica:', error instanceof Error ? error.message : error);
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, [handlePushResponse, session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      unreadRequestSequence.current += 1;
      setUnreadCount(0);
      return;
    }
    void refreshUnreadNotifications();
    const channel = supabase.channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (payload.new.author_id !== userId) void refreshUnreadNotifications();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        void refreshUnreadNotifications();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` }, () => {
        void refreshUnreadNotifications();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_invitations', filter: `invited_user_id=eq.${userId}` }, () => {
        void refreshUnreadNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshUnreadNotifications, session?.user.id]);

  function setMain(next: Tab) { setTab(next); setPage(next); setConversation(null); }
  function openChat(conv: Conversation, title: string) { setConversation(conv); setChatTitle(title); setPage('chat'); }
  function back() { setPage(tab); setConversation(null); }

  let screen: React.ReactNode = null;
  if (page === 'chats') screen = <InboxScreen userId={session?.user.id || ''} refreshKey={0} onChat={openChat} onUnreadCount={setUnreadCount} />;
  if (page === 'discover') screen = <DiscoverScreen userId={session?.user.id || ''} onChat={openChat} onCreate={() => setPage('create')} />;
  if (page === 'map') screen = <MapScreen userId={session?.user.id || ''} isAdmin={isAdmin} onChat={openChat} />;
  if (page === 'profile' && profile) screen = <ProfileScreen userId={session?.user.id || ''} onPrivacy={() => setPage('privacy')} />;
  if (page === 'privacy') screen = <PrivacyScreen />;
  if (page === 'chat' && conversation) screen = <ChatScreen key={conversation.id} conversation={conversation} userId={session?.user.id || ''} />;
  if (page === 'create') screen = <CreateConversationScreen userId={session?.user.id || ''} onDone={c => openChat(c, c.title)} onCancel={back} />;
  if (page === 'admin' && isAdmin) screen = <AdminScreen />;
  const hasSubPage = !(['chats', 'discover', 'map', 'profile'] as Page[]).includes(page);

  return <SafeAreaProvider>
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {!configured ? <View style={styles.center}>
        <HCText big>HERMANO CHAT</HCText>
        <HCText muted style={styles.helper}>Per attivare la registrazione e i messaggi reali, aggiungi nel file .env l'URL e la chiave pubblicabile del tuo progetto Supabase. Consulta README.md.</HCText>
      </View>
        : checking ? <View style={styles.center}><ActivityIndicator size="large" color={C.blue} /><HCText>Connessione...</HCText></View>
          : !session ? <AuthScreen />
            : !profile ? <View style={styles.center}><ActivityIndicator color={C.blue} /><HCText muted style={styles.helper}>Caricamento profilo... Se rimane bloccato, verifica di avere eseguito la migrazione SQL e confermato l'email.</HCText><Btn label="Riprova" onPress={loadProfile} /></View>
              : <>
                <View style={styles.topbar}>
                  {hasSubPage && <Pressable onPress={back} style={styles.back} accessibilityLabel="Indietro"><Text style={styles.topIcon}>‹</Text></Pressable>}
                  <View style={{ flex: 1 }}>
                    <HCText style={{ fontWeight: '900', fontSize: 21, letterSpacing: 0.3 }}>
                      {page === 'chats' ? 'HERMANO CHAT' : page === 'discover' ? 'Cerca' : page === 'map' ? 'HERMANO MAP' : page === 'profile' ? 'Profilo' : page === 'create' ? 'Nuova community' : page === 'admin' ? 'Team HERMANO' : page === 'privacy' ? 'Privacy' : chatTitle || 'Messaggi'}
                    </HCText>
                  </View>
                  {page === 'profile' && isAdmin && <Pressable onPress={() => setPage('admin')} style={styles.adminShortcut}><HCText style={{ fontWeight: '800', fontSize: 12 }}>Team</HCText></Pressable>}
                  <View style={styles.brand}><HCText style={{ fontSize: 23, fontWeight: '900' }}>H</HCText></View>
                </View>
                <View style={{ flex: 1 }}>{screen}</View>
                {!hasSubPage && <View style={styles.bottom}>
                  {([['chats','◉','Chat'],['discover','⌕','Cerca'],['map','⌖','Mappa'],['profile','♙','Profilo']] as [Tab,string,string][]).map(([key, icon, label]) =>
                    <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === key }} key={key} onPress={() => setMain(key)} style={styles.navItem}>
                      <View style={styles.navIcon}>
                        <Text style={{ fontSize: 23, color: tab === key ? C.white : C.muted }}>{icon}</Text>
                        {key === 'chats' && unreadCount > 0 && <View style={styles.navBadge}>
                          <Text style={styles.navBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>}
                      </View>
                      <HCText style={{ fontSize: 12, color: tab === key ? C.white : C.muted, fontWeight: tab === key ? '900' : '500' }}>{label}</HCText>
                    </Pressable>)}
                </View>}
              </>}
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 15 },
  helper: { textAlign: 'center', lineHeight: 23 },
  topbar: { minHeight: 65, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center', borderBottomColor: C.border, borderBottomWidth: 1 },
  back: { paddingHorizontal: 8 },
  topIcon: { color: C.white, fontSize: 28 },
  adminShortcut: { backgroundColor: C.blue, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  brand: { width: 42, height: 42, backgroundColor: C.blue, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', backgroundColor: C.panel, borderTopColor: C.border, borderTopWidth: 1, paddingTop: 9, paddingBottom: 7 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navIcon: { position: 'relative' },
  navBadge: { position: 'absolute', top: -2, right: -13, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0445B' },
  navBadgeText: { color: C.white, fontSize: 9, fontWeight: '900' },
});
