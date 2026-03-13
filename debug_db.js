const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Manual load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.trim().match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            process.env[key] = value;
        }
    });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ckcwwfgmvdvemwclphrl.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_SDQmjW8XE0hSn6NpV4g15A_RNIf4KQd';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    console.log('Fetching players...');
    const { data, error } = await supabase.from('players').select('uid, username, highscore').order('highscore', { ascending: false }).limit(20);
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Players count:', data.length);
        console.log('Top Players:', data);
    }
}

check();
