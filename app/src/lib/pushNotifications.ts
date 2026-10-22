import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

function getProjectId() {
  return Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
}

export async function enablePushNotifications(userId: string) {
  if (Platform.OS === 'web') {
    throw new Error('Le notifiche push sono disponibili nell’app iOS o Android installata.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifiche',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1666FF',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Autorizza le notifiche nelle impostazioni del dispositivo e riprova.');
  }

  const projectId = getProjectId();
  if (!projectId) throw new Error('Project ID Expo mancante nella configurazione dell’app.');
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { error } = await supabase.from('expo_push_tokens').upsert({
    user_id: userId,
    expo_push_token: token,
    platform: Platform.OS,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'expo_push_token' });
  if (error) throw error;
}

export async function disablePushNotifications(userId: string) {
  const { error } = await supabase.from('expo_push_tokens').delete().eq('user_id', userId);
  if (error) throw error;
}

export async function arePushNotificationsEnabled(userId: string) {
  const { data, error } = await supabase.from('expo_push_tokens')
    .select('expo_push_token').eq('user_id', userId).limit(1).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function notifyMessageRecipients(messageId: string) {
  const { data, error } = await supabase.functions.invoke('push-notification', {
    body: { messageId },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'failed' in data
    && typeof data.failed === 'number' && data.failed > 0) {
    throw new Error('Una o più notifiche non sono state consegnate.');
  }
}
