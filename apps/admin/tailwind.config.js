/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { brand: { blue: '#0B3C7A', orange: '#F28C28', green: '#2FA66A' } } } },
  plugins: [],
};
