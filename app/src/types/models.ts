export type Profile = {
  id: string;
  username: string;
  display_name: string;
};

export type Conversation = {
  id: string;
  kind: 'dm' | 'group' | 'channel';
  title: string;
  description: string;
  is_public: boolean;
  owner_id: string;
  created_at: string;
};

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at?: string;
  last_read_at?: string | null;
};

export type ConversationInvitation = {
  id: string;
  conversation_id: string;
  invited_user_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

export type InboxItem = Conversation & {
  displayTitle: string;
  subtitle: string;
  lastAt: string;
  unreadCount?: number;
};

export type QuotedMessage = {
  id: string;
  author_id: string;
  body: string;
  deleted_at?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
};

export type Message = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: QuotedMessage | null;
  forwarded_from_message_id?: string | null;
  media_path?: string | null;
  media_type?: 'image' | 'video' | 'audio' | null;
  media_duration_ms?: number | null;
  media_url?: string;
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  description: string;
  latitude: number;
  longitude: number;
  status: 'pending' | 'approved' | 'rejected';
  sponsored: boolean;
  website: string | null;
  channel_id: string | null;
  submitted_by: string;
};
