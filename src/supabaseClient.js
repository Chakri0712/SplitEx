
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ryjhfcfyglaabpowoxwk.supabase.co'
const supabaseAnonKey = 'sb_publishable_nrspUCsyQY3VT39IWroJxg_5EZ_TRIE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
