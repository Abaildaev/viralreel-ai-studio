import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const { error } = await supabase.storage.createBucket('reels', { public: true });

if (error && !/already exists/i.test(error.message)) {
  throw error;
}

console.log(error ? 'Bucket reels already exists.' : 'Bucket reels created.');
