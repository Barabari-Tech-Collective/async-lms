export interface User {
  id: string | number;
  full_name: string;
  email: string;
  role: 'student' | 'facilitator' | 'admin' | 'curriculum_developer';
  is_verified: boolean;
  college_id?: string | number;
  college_ids?: (string | number)[];
  subject_ids?: string[];
  college_is_verified?: boolean;
  college_name?: string;
  degree?: string;
  year?: number;
  domain?: string | null;
  role_focus?: string | null;
  onboarding_step: string;
  must_change_password?: boolean;
  current_streak?: number;
  total_points?: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}
