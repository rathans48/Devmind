import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
        '192.168.0.106',
        "192.168.0.103",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://192.168.0.103:3000",
        "http://192.168.0.103:3001"]
};

export default nextConfig;
