import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  security: {
    twoFactor: false,
    shareStatus: true,
    analyticsOptIn: false,
    sessionTimeout: "30_mins",
    twoFactorSecretEncrypted: "",
    twoFactorRecoveryCodesEncrypted: ""
  },
  integrations: {
    github: { connected: false, repo: "" },
    slack: { connected: true, channel: "#proj-spacers" },
    gcal: { connected: false },
    figma: { connected: true }
  }
};

const APPEARANCE_CACHE_VERSION = 1;
const GUEST_APPEARANCE_CACHE_KEY = 'spacers:appearance:v1:guest';
const THEME_IDS = ['dark', 'high_contrast', 'midnight', 'emerald', 'amethyst', 'crimson', 'light', 'system'];
const ACCENT_COLOR_IDS = ['lime', 'cyan', 'purple', 'gold', 'rose', 'orange', 'sapphire', 'green'];
const APPEARANCE_OPTIONS = {
  sidebarPosition: ['left', 'right'],
  density: ['comfortable', 'compact', 'spacious'],
  animationSpeed: ['smooth', 'fast', 'none'],
  glassmorphism: ['soft', 'intense', 'flat']
};

function sanitizeAppearance(value) {
  const appearance = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sanitized = { ...defaultPreferences.appearance };

  if (THEME_IDS.includes(appearance.theme)) sanitized.theme = appearance.theme;
  if (ACCENT_COLOR_IDS.includes(appearance.accentColor)) sanitized.accentColor = appearance.accentColor;

  for (const [key, options] of Object.entries(APPEARANCE_OPTIONS)) {
    if (options.includes(appearance[key])) sanitized[key] = appearance[key];
  }

  for (const key of ['compactUi', 'autoCollapseSidebar']) {
    if (typeof appearance[key] === 'boolean') sanitized[key] = appearance[key];
  }

  if (typeof appearance.animations === 'string') sanitized.animations = appearance.animations;
  return sanitized;
}

function appearanceCacheKey(userId) {
  return `spacers:appearance:v1:user:${encodeURIComponent(userId)}`;
}

function readAppearanceCache(key) {
  if (typeof localStorage === 'undefined') return null;

  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (cached?.version !== APPEARANCE_CACHE_VERSION || !cached.appearance || typeof cached.appearance !== 'object') {
      if (cached !== null) localStorage.removeItem(key);
      return null;
    }
    return sanitizeAppearance(cached.appearance);
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      return null;
    }
    return null;
  }
}

function writeAppearanceCache(key, appearance) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(key, JSON.stringify({
      version: APPEARANCE_CACHE_VERSION,
      appearance: sanitizeAppearance(appearance)
    }));
  } catch {
    // Storage may be unavailable or full; Supabase remains the account source of truth.
  }
}

function preferencesForSession(session) {
  const user = session?.user;
  if (!user) {
    return {
      ...defaultPreferences,
      appearance: readAppearanceCache(GUEST_APPEARANCE_CACHE_KEY) || defaultPreferences.appearance
    };
  }

  const remotePreferences = user.user_metadata?.preferences || {};
  const remoteAppearance = remotePreferences.appearance;
  const hasRemoteAppearance = remoteAppearance && typeof remoteAppearance === 'object' && !Array.isArray(remoteAppearance);
  const userCacheKey = appearanceCacheKey(user.id);
  const appearance = hasRemoteAppearance
    ? sanitizeAppearance(remoteAppearance)
    : readAppearanceCache(userCacheKey) || defaultPreferences.appearance;

  writeAppearanceCache(userCacheKey, appearance);
  return { ...defaultPreferences, ...remotePreferences, appearance };
}

const PreferencesContext = createContext();

export function PreferencesProvider({ children, initialSession = null }) {
  const [preferences, setPreferences] = useState(() => preferencesForSession(initialSession));
  const [loading] = useState(false);
  const activeUserId = useRef(initialSession?.user?.id || null);
  const preferencesRef = useRef(preferences);

  // Supabase appearance overrides the matching user's local fallback; guest cache never hydrates a new account.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const nextPreferences = preferencesForSession(session);
        activeUserId.current = session.user.id;
        preferencesRef.current = nextPreferences;
        setPreferences(nextPreferences);
        return;
      }

      const previousUserId = activeUserId.current;
      if (previousUserId) {
        writeAppearanceCache(GUEST_APPEARANCE_CACHE_KEY, preferencesRef.current.appearance);
      }

      activeUserId.current = null;
      const nextPreferences = preferencesForSession(null);
      preferencesRef.current = nextPreferences;
      setPreferences(nextPreferences);
    });

    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;

    const theme = sanitizeAppearance(preferences.appearance).theme;
    const accentColor = sanitizeAppearance(preferences.appearance).accentColor;
    root.dataset.theme = theme;
    root.dataset.accent = accentColor;

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: light)');
    const applyColorScheme = () => {
      const isLight = theme === 'light' || (theme === 'system' && mediaQuery?.matches);
      root.dataset.colorScheme = isLight ? 'light' : 'dark';
      root.classList.toggle('light', isLight);
      root.classList.toggle('dark', !isLight);
    };

    applyColorScheme();
    if (theme !== 'system' || !mediaQuery) return undefined;

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', applyColorScheme);
    } else {
      mediaQuery.addListener?.(applyColorScheme);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', applyColorScheme);
      } else {
        mediaQuery.removeListener?.(applyColorScheme);
      }
    };
  }, [preferences.appearance]);

  // Apply non-color appearance settings globally.
  useEffect(() => {
    const root = document.documentElement;

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
    if (category === 'appearance') {
      Object.assign(updatedCategory, sanitizeAppearance(updatedCategory));
      const userId = activeUserId.current;
      writeAppearanceCache(
        userId ? appearanceCacheKey(userId) : GUEST_APPEARANCE_CACHE_KEY,
        updatedCategory
      );
    }
    const updatedPreferences = { ...preferences, [category]: updatedCategory };
    
    // Optimistic UI update
    preferencesRef.current = updatedPreferences;
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
