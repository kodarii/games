/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        apex: {
          ink: {
            DEFAULT: '#1c1c1e',
            2: '#3a3a3a',
            3: '#4a4a4a',
            4: '#5a5a5a',
            5: '#666666',
            6: '#888888',
          },
          muted: '#9a9a9a',
          faint: '#b0b0b0',
          hint: '#b8b8b8',
          kbd: '#c0c0c0',
          idle: '#c8c8c8',
          disabled: '#cccccc',
          accent: '#4F6EF7',
          line: {
            1: '#e2e2e2',
            2: '#e4e4e4',
            3: '#e8e8e8',
            4: '#ebebeb',
            5: '#f0f0f0',
          },
          surface: {
            head: '#f2f2f2',
            hover: '#f5f5f5',
            hover2: '#f6f6f6',
            chip: '#f8f8f8',
          },
          row: {
            DEFAULT: '#f0f3ff',
            hover: '#fafbff',
          },
          status: {
            progress: '#4F6EF7',
            pending: '#f59e0b',
            done: '#10b981',
            inactive: '#ef4444',
          },
        },
      },
      boxShadow: {
        'apex-1': '0 1px 4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
        'apex-2': '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
