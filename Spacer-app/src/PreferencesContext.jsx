import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const defaultPreferences = {
  appearance: {
    theme: "dark",
    accentColor: "lime",
    compactUi: false,
    autoCollapseSidebar: false,
    animations: "smooth"
  },
  notifications: {
    emailAlerts: true,
    taskAssigned: true,
    projectUpdates: true,
    weeklyDigest: false,
    soundEffects: true,
    desktopPush: true,
    frequency: "realtime"
  },
  security: {
    twoFactor: false,
    shareStatus: true,
    analyticsOptIn: false,
    sessionTimeout: "30_mins"
  },
  integrations: {
    github: { connected: true, repo: "acme/spacers-web" },
    slack: { connected: true, channel: "#proj-spacers" },
    gcal: { connected: false },
    figma: { connected: true }
  }
};

const PreferencesContext = createContext();

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [loading, setLoading] = useState(true);

  // Load from Supabase user_metadata
  useEffect(() => {
    const fetchPrefs = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.user_metadata?.preferences) {
        setPreferences({
          ...defaultPreferences,
          ...session.user.user_metadata.preferences
        });
      }
      setLoading(false);
    };
    fetchPrefs();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.user_metadata?.preferences) {
        setPreferences({
          ...defaultPreferences,
          ...session.user.user_metadata.preferences
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Apply appearance globally
  useEffect(() => {
    const root = document.documentElement;
    
    // Theme mapping
    const themes = {
      dark: { // Obsidian Dark
        base: "#101509",
        surface: "#1d2115",
        lowest: "#0b1005",
        border: "#424934",
        surfaceHigh: "#272c1e",
        highest: "#323729",
        surfaceLow: "#191d11"
      },
      high_contrast: { // High Contrast
        base: "#050704",
        surface: "#0a0d08",
        lowest: "#000000",
        border: "#5c664b",
        surfaceHigh: "#12170f",
        highest: "#1a2115",
        surfaceLow: "#070a05"
      },
      system: { // System default (acts as dark for now)
        base: "#101509",
        surface: "#1d2115",
        lowest: "#0b1005",
        border: "#424934",
        surfaceHigh: "#272c1e",
        highest: "#323729",
        surfaceLow: "#191d11"
      }
    };

    const selectedTheme = themes[preferences.appearance.theme] || themes.dark;
    root.style.setProperty('--bg-base', selectedTheme.base);
    root.style.setProperty('--bg-surface', selectedTheme.surface);
    root.style.setProperty('--bg-lowest', selectedTheme.lowest);
    root.style.setProperty('--bg-border', selectedTheme.border);
    root.style.setProperty('--bg-surface-high', selectedTheme.surfaceHigh);
    root.style.setProperty('--bg-highest', selectedTheme.highest);
    root.style.setProperty('--bg-surface-low', selectedTheme.surfaceLow);

    // Always maintain dark class as per default setup
    root.classList.add("dark");
    root.classList.remove("light");

    // Accent Color mapping (using hex values or Tailwind colors)
    const accentColors = {
      lime: "#aff82a",
      cyan: "#2dd4bf",
      purple: "#a855f7",
      gold: "#fbbf24"
    };

    const accentColorsDim = {
      lime: "#96da00",
      cyan: "#14b8a6",
      purple: "#9333ea",
      gold: "#f59e0b"
    };

    const accentColorsRgb = {
      lime: "175, 248, 42",
      cyan: "45, 212, 191",
      purple: "168, 85, 247",
      gold: "251, 191, 36"
    };
    
    const selectedColor = accentColors[preferences.appearance.accentColor] || accentColors.lime;
    const selectedColorDim = accentColorsDim[preferences.appearance.accentColor] || accentColorsDim.lime;
    const selectedColorRgb = accentColorsRgb[preferences.appearance.accentColor] || accentColorsRgb.lime;
    
    root.style.setProperty('--primary-color', selectedColor);
    root.style.setProperty('--primary-color-dim', selectedColorDim);
    root.style.setProperty('--primary-color-rgb', selectedColorRgb);

    if (preferences.appearance.compactUi) {
      root.classList.add("compact-ui");
    } else {
      root.classList.remove("compact-ui");
    }

  }, [preferences.appearance]);

  const updatePreferences = async (category, newValues) => {
    const updatedCategory = { ...preferences[category], ...newValues };
    const updatedPreferences = { ...preferences, [category]: updatedCategory };
    
    // Optimistic UI update
    setPreferences(updatedPreferences);

    // Persist to Supabase
    await supabase.auth.updateUser({
      data: { preferences: updatedPreferences }
    });
  };

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences, loading }}>
      {children}
    </PreferencesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
  return useContext(PreferencesContext);
}
