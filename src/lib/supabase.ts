import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserType = 'viewer' | 'participant' | 'admin';
export type ShowStatus = 'upcoming' | 'live' | 'ended';
export type ParticipantStatus = 'pending' | 'approved' | 'rejected' | 'performing';

export interface UserProfile {
  id: string;
  full_name: string;
  phone?: string;
  user_type: UserType;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Show {
  id: string;
  title: string;
  description: string;
  banner_url?: string;
  status: ShowStatus;
  scheduled_at: string;
  started_at?: string;
  ended_at?: string;
  total_seats: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  user_id: string;
  show_id: string;
  stage_name: string;
  bio?: string;
  voice_clip_url: string;
  status: ParticipantStatus;
  performance_order?: number;
  total_votes: number;
  created_at: string;
  updated_at: string;
  user_profiles?: UserProfile;
}

export interface VirtualSeat {
  id: string;
  show_id: string;
  user_id: string;
  seat_number: number;
  joined_at: string;
}

export interface Vote {
  id: string;
  participant_id: string;
  user_id: string;
  show_id: string;
  voted_at: string;
}

export interface SpeakerSeat {
  id: string;
  show_id: string;
  seat_number: number;
  user_id?: string;
  is_muted: boolean;
  joined_at: string;
  user_profiles?: UserProfile;
}

export interface ShowComment {
  id: string;
  show_id: string;
  user_id: string;
  comment_text: string;
  created_at: string;
  user_profiles?: UserProfile;
}
