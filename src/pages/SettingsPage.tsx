import React, { useState, useRef } from 'react';
import { User, Bell, Shield, Globe, Moon, Sun, Save, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../lib/api';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [name, setName] = useState(user?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '');
  const [email] = useState(user?.email ?? '');
  // Saved on the account (PUT /api/auth/preferences), so they follow the user across devices.
  const [language, setLanguage] = useState<'en' | 'ar'>(user?.preferences?.language ?? 'en');
  const [notifySessions, setNotifySessions] = useState(user?.preferences?.notifySessions ?? true);
  const [notifyDiscussions, setNotifyDiscussions] = useState(user?.preferences?.notifyCommunity ?? true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isChangingPw, setIsChangingPw] = useState(false);

  const getInitials = (n?: string) =>
    !n
      ? '?'
      : n
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((p) => p[0])
          .join('')
          .toUpperCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!name.trim()) {
      setSaveError('Name cannot be empty');
      return;
    }
    setIsSaving(true);
    try {
      await api.put('/api/auth/profile', { name: name.trim(), avatarUrl: avatarUrl || undefined });
      await api.put('/api/auth/preferences', {
        language,
        notifyCommunity: notifyDiscussions,
        notifySessions,
      });
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarMessage(null);
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMessage({ type: 'err', text: 'Max size 2MB' });
      return;
    }
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/api/auth/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAvatarUrl(data.avatarUrl);
      setAvatarMessage({ type: 'ok', text: 'Avatar updated' });
    } catch (err: any) {
      setAvatarMessage({ type: 'err', text: err?.response?.data?.message || 'Upload failed' });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    setIsChangingPw(true);
    try {
      await api.put('/api/auth/password', { currentPassword, newPassword });
      setPwMessage({ type: 'ok', text: 'Password updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPwMessage({ type: 'err', text: err?.response?.data?.message || 'Failed to change password' });
    } finally {
      setIsChangingPw(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-200">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          Account Settings
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          Manage your personal profile, notification preferences, and bilingual localization
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Card */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6">
          <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
            <User className="w-4 h-4 text-[#2D6A4F]" />
            <span>Profile Details</span>
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-sm"
              />
            ) : (
              <span className="w-20 h-20 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center text-xl font-black border-2 border-emerald-500 shadow-sm">
                {getInitials(user?.name)}
              </span>
            )}
            <div className="space-y-2 text-center sm:text-left">
              <input
                type="file"
                accept="image/*"
                ref={avatarInputRef}
                onChange={handleAvatarChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors disabled:opacity-60"
              >
                {isUploadingAvatar ? 'Uploading...' : 'Change Avatar Photo'}
              </button>
              <p className="text-[11px] text-gray-400">
                Recommended 400x400 JPG or PNG. Max size 2MB.
              </p>
              {avatarMessage && (
                <p
                  className={`text-xs font-semibold ${
                    avatarMessage.type === 'ok' ? 'text-[#2D6A4F]' : 'text-red-600'
                  }`}
                >
                  {avatarMessage.text}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Preferences Card */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-6">
          <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#2D6A4F]" />
            <span>Localization & Learning Language</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Primary Interface Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
              >
                <option value="en">English (Default)</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
              {language === 'ar' && (
                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                  Your preference is saved. The Nudra interface is currently available in English only; it will
                  switch automatically when the Arabic version is ready.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Typographic Theme
              </label>
              <div className="px-4 py-2.5 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 font-semibold">
                Quicksand (Google Fonts) • Active
              </div>
            </div>
          </div>
        </div>

        {/* Appearance Card */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
            {theme === 'dark' ? (
              <Moon className="w-4 h-4 text-[#2D6A4F]" />
            ) : (
              <Sun className="w-4 h-4 text-[#2D6A4F]" />
            )}
            <span>Appearance</span>
          </h3>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-bold text-gray-900">Dark Mode</p>
              <p className="text-[11px] text-gray-500">
                Switch between light and dark themes across the app
              </p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className={`w-11 h-6 rounded-full transition-colors relative ${
                theme === 'dark' ? 'bg-[#2D6A4F]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  theme === 'dark' ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Notifications Card */}
        <div className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
          <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#2D6A4F]" />
            <span>Notifications</span>
          </h3>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-xs font-bold text-gray-900">Live Mentorship Reminders</p>
              <p className="text-[11px] text-gray-500">
                Receive notifications 30 minutes before upcoming sessions begin. Live sessions aren't available yet;
                this applies once they launch.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifySessions}
              onChange={(e) => setNotifySessions(e.target.checked)}
              className="accent-[#2D6A4F] w-4 h-4"
            />
          </div>

          <div className="flex items-center justify-between py-2 border-t border-gray-50">
            <div>
              <p className="text-xs font-bold text-gray-900">Community Discussion Alerts</p>
              <p className="text-[11px] text-gray-500">
                Email and in-app notification when someone replies to your posts
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyDiscussions}
              onChange={(e) => setNotifyDiscussions(e.target.checked)}
              className="accent-[#2D6A4F] w-4 h-4"
            />
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center justify-end gap-3">
          {saveError && <span className="text-xs font-bold text-red-600">{saveError}</span>}
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D6A4F]">
              <Check className="w-4 h-4" />
              <span>Settings saved successfully!</span>
            </span>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </form>

      {/* Password Card */}
      <form onSubmit={handlePasswordChange} className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#2D6A4F]" />
          <span>Change Password</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
            />
          </div>
        </div>
        {pwMessage && (
          <p className={`text-xs font-semibold ${pwMessage.type === 'ok' ? 'text-[#2D6A4F]' : 'text-red-600'}`}>
            {pwMessage.text}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isChangingPw || !currentPassword || !newPassword}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60"
          >
            <Shield className="w-4 h-4" />
            <span>{isChangingPw ? 'Updating...' : 'Update Password'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
