import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthState } from './authTypes';
import { loginUser, signupUser, loadUser, completeGoogleSignup } from './authThunks';
import { queryClient } from '@/lib/queryClient';

const token = localStorage.getItem('token');

const initialState: AuthState = {
  user: null,
  token,
  isAuthenticated: Boolean(token),
  status: 'idle',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      localStorage.removeItem('token');
      try {
        queryClient.clear();
      } catch {}
    },
    clearAuthError(state) {
      state.error = null;
    },
    loginWithToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
      state.isAuthenticated = true;
      state.status = 'loading';
      localStorage.setItem('token', action.payload);
      try {
        queryClient.clear();
      } catch {}
    },
    setCredentials(state, action: PayloadAction<{ token: string; user: any }>) {
      if (state.user?.id && state.user.id !== action.payload.user?.id) {
        try {
          queryClient.clear();
        } catch {}
      }
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.status = 'succeeded';
      state.error = null;
      localStorage.setItem('token', action.payload.token);
    },
  },
  extraReducers: (builder) => {
    builder
      // LOGIN
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        localStorage.setItem('token', action.payload.token);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = typeof action.payload === 'object' && action.payload ? (action.payload as any).message : (action.payload ?? null);
      })

      // SIGNUP
      .addCase(signupUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(signupUser.fulfilled, (state) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(signupUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = typeof action.payload === 'object' && action.payload ? (action.payload as any).message : (action.payload ?? null);
      })

      // COMPLETE GOOGLE SIGNUP
      .addCase(completeGoogleSignup.pending, (state) => {
        state.status = 'loading';
      })
      // Returns only a single-use code now; the session is established when
      // AuthCallback exchanges it, so there is nothing to store here.
      .addCase(completeGoogleSignup.fulfilled, (state) => {
        state.status = 'idle';
        state.error = null;
      })
      .addCase(completeGoogleSignup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? null;
      })

      // LOAD USER
      .addCase(loadUser.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(loadUser.fulfilled, (state, action: PayloadAction<any>) => {
        state.status = 'succeeded';
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(loadUser.rejected, (state) => {
        // Do NOT clear the token here — loadUser can fail on transient network
        // errors (WSL2 restart, brief downtime) which should not log the user out.
        // Token is only cleared by the explicit logout() action.
        state.user = null;
        state.status = 'failed';
      });
  },
});

export const { logout, clearAuthError, loginWithToken, setCredentials } = authSlice.actions;
export default authSlice.reducer;
