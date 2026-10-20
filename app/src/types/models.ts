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

export type InboxItem = Conversation & {
  displayTitle: string;
  subtitle: string;
  lastAt: string;
  unreadCount?: number;
};

export type Message = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
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
