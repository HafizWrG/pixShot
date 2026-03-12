import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckcwwfgmvdvemwclphrl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SDQmjW8XE0hSn6NpV4g15A_RNIf4KQd';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type PlayerProfile = {
  uid: string;
  username: string;
  password_hash: string;
  coins: number;
  tokens: number;
  highscore: number;
  total_kills: number;
  matches: number;
  owned_classes: string[];
  created_at?: string;
  updated_at?: string;
};

export type FriendRelation = {
  id?: number;
  user_uid: string;
  friend_uid: string;
  friend_name: string;
  status: string;
  created_at?: string;
};

export type PurchaseRecord = {
  id?: number;
  user_uid: string;
  item_type: string;
  item_id: string;
  cost: number;
  created_at?: string;
};
