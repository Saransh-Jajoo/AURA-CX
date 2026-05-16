"use client";

/* eslint-disable react-hooks/purity, react-hooks/immutability */

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Float } from "@react-three/drei";
import * as THREE from "three";
import type { ClusterData } from "@/lib/types";

/* ══════════════════════════════════════════════════════════
   3D HDBSCAN Cluster Visualization
   Elegant, abstract, slow-moving particle cloud.
   Each cluster = group of softly glowing spheres.
   Anomalies pulse red. Lazy-loaded with Suspense.
   ══════════════════════════════════════════════════════════ */

const PALETTE = [
  "#818CF8", "#A78BFA", "#2DD4BF", "#34D399",
  "#FBBF24", "#38BDF8", "#F472B6", "#6EE7B7",
];
const ANOMALY_COLOR = "#FB7185";

function ClusterSphere({
  position,
  color,
  radius,
  isAnomaly,
  delay,
}: {
  position: [number, number, number];
  color: string;
  radius: number;
  isAnomaly: boolean;
  delay: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const t = useRef(delay);

  useFrame((_, delta) => {
    t.current += delta;
    if (meshRef.current) {
      // Gentle floating motion
      meshRef.current.position.y += Math.sin(t.current * 0.6) * 0.0004;
    }
    if (isAnomaly && matRef.current) {
      // Soft pulse for anomalies
      const pulse = 0.4 + Math.sin(t.current * 2) * 0.3;
      matRef.current.emissiveIntensity = pulse;
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[radius, 24, 24]} />
      <meshStandardMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={isAnomaly ? 0.8 : 0.55}
        roughness={0.5}
        metalness={0.1}
        emissive={isAnomaly ? ANOMALY_COLOR : color}
        emissiveIntensity={isAnomaly ? 0.4 : 0.08}
      />
    </mesh>
  );
}

function ClusterCloud({ clusters }: { clusters: ClusterData[] }) {
  const points = useMemo(() => {
    const result: {
      pos: [number, number, number];
      color: string;
      radius: number;
      isAnomaly: boolean;
      delay: number;
    }[] = [];

    clusters.forEach((cluster, ci) => {
      const color = cluster.is_anomaly ? ANOMALY_COLOR : PALETTE[ci % PALETTE.length];
      const count = Math.min(Math.max(cluster.size / 5, 4), 20);
      const scale = Math.sqrt(cluster.size) * 0.06;

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = scale * (0.5 + Math.random() * 0.5);

        const cx = cluster.x * 0.3;
        const cy = cluster.y * 0.3;
        const cz = (cluster.z ?? (ci - clusters.length / 2)) * 0.3;

        result.push({
          pos: [
            cx + r * Math.sin(phi) * Math.cos(theta),
            cy + r * Math.sin(phi) * Math.sin(theta),
            cz + r * Math.cos(phi),
          ],
          color,
          radius: 0.04 + Math.random() * 0.06,
          isAnomaly: cluster.is_anomaly,
          delay: Math.random() * 10,
        });
      }
    });

    return result;
  }, [clusters]);

  return (
    <>
      {points.map((p, i) => (
        <ClusterSphere
          key={i}
          position={p.pos}
          color={p.color}
          radius={p.radius}
          isAnomaly={p.isAnomaly}
          delay={p.delay}
        />
      ))}
    </>
  );
}

function AutoRotateCamera() {
  const { camera } = useThree();
  const t = useRef(0);

  useFrame((_, delta) => {
    t.current += delta * 0.1; // Very slow rotation
    camera.position.x = Math.sin(t.current) * 5;
    camera.position.z = Math.cos(t.current) * 5;
    camera.position.y = 2 + Math.sin(t.current * 0.5) * 0.5;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

interface Cluster3DProps {
  clusters: ClusterData[];
  isDark: boolean;
}

export function Cluster3DScene({ clusters, isDark }: Cluster3DProps) {
  return (
    <div className="w-full h-[400px] rounded-[var(--radius-lg)] overflow-hidden">
      <Canvas
        camera={{ position: [5, 2, 5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        {/* Lighting */}
        <ambientLight intensity={isDark ? 0.3 : 0.5} />
        <pointLight position={[5, 5, 5]} intensity={isDark ? 0.6 : 0.4} color={isDark ? "#818CF8" : "#6366F1"} />
        <pointLight position={[-5, -3, -5]} intensity={0.3} color={isDark ? "#2DD4BF" : "#0D9488"} />
        <pointLight position={[0, 5, -3]} intensity={0.15} color="#F472B6" />

        {/* Clusters */}
        <Float speed={0.3} rotationIntensity={0.05} floatIntensity={0.1}>
          <ClusterCloud clusters={clusters} />
        </Float>

        {/* Controls */}
        <AutoRotateCamera />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={true}
          autoRotate={false}
          maxPolarAngle={Math.PI * 0.75}
          minPolarAngle={Math.PI * 0.25}
        />
      </Canvas>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   2D Fallback — Premium scatter visualization
   For low-power devices or user preference.
   ══════════════════════════════════════════════════════════ */

export function Cluster2DFallback({ clusters }: { clusters: ClusterData[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Find bounds
    const xs = clusters.map((c) => c.x);
    const ys = clusters.map((c) => c.y);
    const minX = Math.min(...xs) - 1;
    const maxX = Math.max(...xs) + 1;
    const minY = Math.min(...ys) - 1;
    const maxY = Math.max(...ys) + 1;

    const scaleX = (v: number) => ((v - minX) / (maxX - minX)) * (rect.width - 60) + 30;
    const scaleY = (v: number) => ((v - minY) / (maxY - minY)) * (rect.height - 60) + 30;

    clusters.forEach((cluster, ci) => {
      const cx = scaleX(cluster.x);
      const cy = scaleY(cluster.y);
      const r = Math.max(Math.sqrt(cluster.size) * 1.5, 8);
      const color = cluster.is_anomaly ? ANOMALY_COLOR : PALETTE[ci % PALETTE.length];

      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.5);
      grad.addColorStop(0, color + "30");
      grad.addColorStop(1, color + "00");
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color + "90";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      const style = getComputedStyle(document.documentElement);
      ctx.fillStyle = style.getPropertyValue("--text-muted").trim() || "#71717A";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(cluster.label, cx, cy + r + 14);
    });
  }, [clusters]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-[400px] rounded-[var(--radius-lg)]"
      style={{ background: "transparent" }}
    />
  );
}
