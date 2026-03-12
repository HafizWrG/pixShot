/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true, // Supaya gambar dari Supabase/Dicebear muncul
  },
};

export default nextConfig;