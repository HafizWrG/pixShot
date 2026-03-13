import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckcwwfgmvdvemwclphrl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SDQmjW8XE0hSn6NpV4g15A_RNIf4KQd';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
