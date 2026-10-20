import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const defaultPreferences = {
  appearance: {
    theme: "dark",
    accentColor: "lime",
    compactUi: false,
    autoCollapseSidebar: false,
    animations: "smooth",
    sidebarPosition: "left",
    density: "comfortable",
    animationSpeed: "smooth",
    glassmorphism: "soft"
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
  // Two-factor lives in Supabase Auth MFA (components/TwoFactorSettings.jsx), not in preferences
  security: {
    shareStatus: true,
    analyticsOptIn: false,
    sessionTimeout: "30_mins"
  },
  // No integrations are built yet (Settings shows them as "Coming soon"),
  // so nothing may default to connected
  integrations: {
    github: { connected: false },
    slack: { connected: false },
    gcal: { connected: false },
    figma: { connected: false }
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
      dark: { // Obsidian Dark / Department palette
        base: "#0F1115",
        surface: "#191c21",
        lowest: "#0b0c0e",
        border: "#2D3139",
        surfaceHigh: "#20242b",
        highest: "#252a33",
        surfaceLow: "#14161b"
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
      midnight: { // Midnight Blue
        base: "#0b0f19",
        surface: "#151b2d",
        lowest: "#070a12",
        border: "#2e3a5f",
        surfaceHigh: "#1e263f",
        highest: "#283254",
        surfaceLow: "#101524"
      },
      emerald: { // Forest Emerald
        base: "#05100a",
        surface: "#0b1c12",
        lowest: "#020805",
        border: "#1d3c29",
        surfaceHigh: "#122b1c",
        highest: "#1a3b27",
        surfaceLow: "#08160e"
      },
      amethyst: { // Deep Amethyst
        base: "#0c0714",
        surface: "#170e24",
        lowest: "#050308",
        border: "#3b235c",
        surfaceHigh: "#231536",
        highest: "#301d4a",
        surfaceLow: "#120b1c"
      },
      crimson: { // Cyberpunk Red
        base: "#140505",
        surface: "#240a0a",
        lowest: "#080202",
        border: "#4c1414",
        surfaceHigh: "#360e0e",
        highest: "#4a1414",
        surfaceLow: "#1c0707"
      },
      system: { // System default (matches department dark)
        base: "#0F1115",
        surface: "#191c21",
        lowest: "#0b0c0e",
        border: "#2D3139",
        surfaceHigh: "#20242b",
        highest: "#252a33",
        surfaceLow: "#14161b"
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
      gold: "#fbbf24",
      rose: "#f43f5e",
      orange: "#f97316",
      sapphire: "#3b82f6",
      green: "#22c55e"
    };

    const accentColorsDim = {
      lime: "#96da00",
      cyan: "#14b8a6",
      purple: "#9333ea",
      gold: "#f59e0b",
      rose: "#e11d48",
      orange: "#ea580c",
      sapphire: "#2563eb",
      green: "#16a34a"
    };

    const accentColorsRgb = {
      lime: "175, 248, 42",
      cyan: "45, 212, 191",
      purple: "168, 85, 247",
      gold: "251, 191, 36",
      rose: "244, 63, 94",
      orange: "249, 115, 22",
      sapphire: "59, 130, 246",
      green: "34, 197, 94"
    };
    
    const selectedColor = accentColors[preferences.appearance.accentColor] || accentColors.lime;
    const selectedColorDim = accentColorsDim[preferences.appearance.accentColor] || accentColorsDim.lime;
    const selectedColorRgb = accentColorsRgb[preferences.appearance.accentColor] || accentColorsRgb.lime;
    
    root.style.setProperty('--primary-color', selectedColor);
    root.style.setProperty('--primary-color-dim', selectedColorDim);
    root.style.setProperty('--primary-color-rgb', selectedColorRgb);

    // Apply layout custom styles to document root
    const sidebarPos = preferences.appearance.sidebarPosition || "left";
    root.style.setProperty('--sidebar-position', sidebarPos);
    if (sidebarPos === "right") {
      root.classList.add("sidebar-right");
    } else {
      root.classList.remove("sidebar-right");
    }

    // Density setting
    const density = preferences.appearance.density || "comfortable";
    if (density === "compact") {
      root.classList.add("compact-ui");
      root.classList.remove("spacious-ui");
      root.style.setProperty('--density-padding-multiplier', '0.7');
    } else if (density === "spacious") {
      root.classList.add("spacious-ui");
      root.classList.remove("compact-ui");
      root.style.setProperty('--density-padding-multiplier', '1.3');
    } else {
      root.classList.remove("compact-ui", "spacious-ui");
      root.style.setProperty('--density-padding-multiplier', '1.0');
    }

    // Animations speed
    const animSpeed = preferences.appearance.animationSpeed || "smooth";
    if (animSpeed === "fast") {
      root.style.setProperty('--transition-speed', '150ms');
    } else if (animSpeed === "none") {
      root.style.setProperty('--transition-speed', '0ms');
      root.classList.add("reduce-motion");
    } else {
      root.style.setProperty('--transition-speed', '300ms');
      root.classList.remove("reduce-motion");
    }

    // Glassmorphism intensity
    const glass = preferences.appearance.glassmorphism || "soft";
    if (glass === "intense") {
      root.style.setProperty('--glass-blur', '20px');
      root.style.setProperty('--glass-opacity', '0.12');
    } else if (glass === "flat") {
      root.style.setProperty('--glass-blur', '0px');
      root.style.setProperty('--glass-opacity', '1.0');
      root.classList.add("flat-theme");
    } else {
      root.style.setProperty('--glass-blur', '8px');
      root.style.setProperty('--glass-opacity', '0.03');
      root.classList.remove("flat-theme");
    }

    if (preferences.appearance.compactUi) {
      root.classList.add("compact-ui");
    } else if (density !== "compact") {
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
