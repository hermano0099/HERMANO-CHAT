import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Empty, Field, HCText } from '../components/UI';
import { supabase } from '../lib/supabase';
import { C } from '../theme/colors';
import type { Conversation, InboxItem, Message, Profile } from '../types/models';

export function InboxScreen({ userId, onChat, refreshKey }: {
  userId: string; refreshKey: number; onChat: (conv: Conversation, label: string) => void;
}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: mine, error: e1 } = await supabase.from('conversation_members')
        .select('conversation_id,last_read_at').eq('user_id', userId);
      if (e1) throw e1;
      const ids = (mine || []).map(m => m.conversation_id);
      if (!ids.length) { setItems([]); return; }
      const [{ data: convs, error: e2 }, { data: members, error: e3 }] = await Promise.all([
        supabase.from('conversations').select('*').in('id', ids),
        supabase.from('conversation_members').select('conversation_id,user_id,last_read_at').in('conversation_id', ids),
      ]);
      if (e2 || e3) throw e2 || e3;
      const otherIds = Array.from(new Set((members || []).filter(m => m.user_id !== userId).map(m => m.user_id)));
      const people: Record<string, Profile> = {};
      if (otherIds.length) {
        const { data, error } = await supabase.from('profiles').select('id,username,display_name').in('id', otherIds);
        if (error) throw error;
        (data || []).forEach(p => { people[p.id] = p as Profile; });
      }
      const result = await Promise.all(((convs || []) as Conversation[]).map(async c => {
        const membership = (mine || []).find(m => m.conversation_id === c.id);
        const latestRequest = supabase.from('messages').select('*')
          .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1);
        const unreadRequest = supabase.from('messages').select('id', { count: 'exact', head: true })
          .eq('conversation_id', c.id).neq('author_id', userId);
        const [{ data: msgs, error: latestError }, unreadResult] = await Promise.all([
          latestRequest,
          membership?.last_read_at ? unreadRequest.gt('created_at', membership.last_read_at) : unreadRequest,
        ]);
        if (latestError || unreadResult.error) throw latestError || unreadResult.error;
        const last = (msgs?.[0] || null) as Message | null;
        const otherId = (members || []).find(m => m.conversation_id === c.id && m.user_id !== userId)?.user_id;
        const other = otherId ? people[otherId] : null;
        const displayTitle = c.kind === 'dm' ? (other?.display_name || 'Nuova chat') : c.title;
        return {
          ...c, displayTitle,
          subtitle: last ? last.body : (c.kind === 'dm' ? 'Inizia la conversazione' : c.description || 'Nessun messaggio'),
          lastAt: last?.created_at || c.created_at,
          unreadCount: unreadResult.count || 0,
        };
      }));
      setItems(result.sort((a, b) => b.lastAt.localeCompare(a.lastAt)));
    } catch (e: any) { Alert.alert('Impossibile caricare le chat', e.message); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    load();
    const ch = supabase.channel('inbox-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { load(); })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => { load(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, () => { load(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${userId}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, userId, refreshKey]);

  const visible = items.filter(i => i.displayTitle.toLowerCase().includes(term.toLowerCase()));
  return <View style={styles.root}>
    <Field value={term} onChangeText={setTerm} placeholder="Cerca tra le tue chat..." />
    <FlatList data={visible} keyExtractor={it => it.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={C.white} />}
      ListEmptyComponent={<Empty message="Non hai ancora conversazioni. Vai su Cerca per scrivere a qualcuno o entrare in un gruppo." />}
      renderItem={({ item }) => <Pressable onPress={() => onChat(item, item.displayTitle)} style={styles.item}>
        <View style={styles.avatar}><HCText style={{ fontWeight: '900', fontSize: 21 }}>{item.displayTitle.slice(0, 1).toUpperCase()}</HCText></View>
        <View style={{ flex: 1 }}>
          <HCText style={{ fontWeight: '800', fontSize: 17 }}>{item.displayTitle}</HCText>
          <HCText muted style={{ marginTop: 5 }}>{item.subtitle.slice(0, 85)}</HCText>
        </View>
        <View style={styles.itemMeta}>
          <HCText muted style={{ fontSize: 11 }}>{item.kind === 'dm' ? 'CHAT' : item.kind === 'group' ? 'GRUPPO' : 'CANALE'}</HCText>
          {(item.unreadCount || 0) > 0 && <View style={styles.unreadBadge}>
            <HCText style={styles.unreadCount}>{(item.unreadCount || 0) > 99 ? '99+' : item.unreadCount}</HCText>
          </View>}
        </View>
      </Pressable>}
    />
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, padding: 15 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomColor: C.border, borderBottomWidth: 1 },
  avatar: { width: 55, height: 55, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue },
  itemMeta: { alignItems: 'center', gap: 7 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue2 },
  unreadCount: { color: C.white, fontSize: 11, fontWeight: '900' },
});
