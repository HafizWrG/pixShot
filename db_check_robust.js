const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ckcwwfgmvdvemwclphrl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SDQmjW8XE0hSn6NpV4g15A_RNIf4KQd';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { data, error, count } = await supabase.from('players').select('*', { count: 'exact' });
    const result = {
        timestamp: new Date().toISOString(),
        count: count,
        error: error ? error.message : null,
        firstFew: data ? data.slice(0, 3) : []
    };
    fs.writeFileSync('db_check_result.json', JSON.stringify(result, null, 2));
    process.exit(0);
}

check();
