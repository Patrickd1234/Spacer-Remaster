import { createContext, useContext, useState, useEffect } from 'react';
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
    
    // Theme: toggle html.light to switch between dark and light palettes
    const theme = preferences.appearance.theme || 'dark';
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }

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
