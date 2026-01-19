import React, { useState, useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// --- KONFIGURASI ---
const allowedVillages = {
  "001": "CITANGTU",
  "002": "CIMARAGAS",
  "003": "BABAKAN LOA",
  "004": "CIHUNI",
  "005": "SUKAMULYA",
  "006": "SUKAHURIP",
  "007": "SUKARASA",
  "008": "KARANGSARI",
};

// --- DEFINISI PALET WARNA ---
const COLOR_PALETTES = {
  sangat_rentan: ["#7f1d1d", "#b91c1c", "#dc2626", "#ef4444", "#fca5a5"],
  rentan: ["#713f12", "#a16207", "#d97706", "#f59e0b", "#fcd34d"],
  tidak_rentan: ["#14532d", "#15803d", "#16a34a", "#22c55e", "#86efac"],

  // ➕ PERBAIKAN WARNA INDEKS DESA (Merah -> Hijau)
  // Urutan [0] adalah nilai TERTINGGI (Paling Bagus/Paling Banyak)
  // Jadi untuk indeks: [0]=Hijau Tua (Bagus), [4]=Merah (Kurang Bagus)
  indeks_desa: [
    "#15803d", // > 0.8 (Sangat Sejahtera - Hijau Tua)
    "#22c55e", // > 0.7 (Sejahtera - Hijau)
    "#facc15", // > 0.6 (Cukup - Kuning)
    "#f97316", // > 0.5 (Kurang - Oranye)
    "#b91c1c", // < 0.5 (Rentan - Merah)
  ],
};

// Fungsi Warna
function getColor(value, category) {
  const palette = COLOR_PALETTES[category] || COLOR_PALETTES.sangat_rentan;

  // === KHUSUS INDEKS DESA (Skala 0.0 – 1.0) ===
  if (category === "indeks_desa") {
    // Pastikan value tidak null/undefined
    const val = value || 0;
    if (val >= 0.8) return palette[0]; // Sangat Bagus
    if (val >= 0.7) return palette[1];
    if (val >= 0.6) return palette[2];
    if (val >= 0.5) return palette[3];
    return palette[4]; // Merah
  }

  // === KATEGORI SOSIAL (%) ===
  if (value > 40) return palette[0];
  if (value > 30) return palette[1];
  if (value > 20) return palette[2];
  if (value > 10) return palette[3];
  return palette[4];
}

// --- KOMPONEN HELPER ---
function FitBoundsToGeoJSON({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson?.features || geojson.features.length === 0) return;
    const group = L.featureGroup(geojson.features.map((f) => L.geoJSON(f)));
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  }, [geojson, map]);
  return null;
}

function getSafeCenter(feature) {
  if (!feature?.geometry) return null;
  const geom = feature.geometry;
  let coords = [];

  if (geom.type === "Polygon") {
    coords = geom.coordinates[0];
  } else if (geom.type === "MultiPolygon") {
    coords = geom.coordinates
      .map((poly) => poly[0])
      .sort((a, b) => b.length - a.length)[0];
  } else {
    return null;
  }
  if (!coords || coords.length === 0) return null;

  let x = 0,
    y = 0;
  coords.forEach((pt) => {
    y += pt[0];
    x += pt[1];
  });
  return [y / coords.length, x / coords.length];
}

// --- KOMPONEN UTAMA ---
export default function PangatikanMap({ data, desa, semuaDesa }) {
  const [rawDesaGeo, setRawDesaGeo] = useState(null);
  const [desaGeo, setDesaGeo] = useState(null);
  const [kecamatanGeo, setKecamatanGeo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [activeCategory, setActiveCategory] = useState("sangat_rentan");

  // State tambahan untuk menampung rata-rata indeks yang dihitung real-time
  const [calculatedAvgIndex, setCalculatedAvgIndex] = useState(0);

  // 1. FETCH GEOJSON
  useEffect(() => {
    fetch("/geo/32.05_kelurahan.geojson")
      .then((r) => r.json())
      .then((geoData) => {
        const filteredFeatures = geoData.features.filter((f) => {
          const rawKel = String(f.properties.kd_kelurahan);
          const kelId = rawKel.length === 4 ? rawKel.slice(1) : rawKel;
          return (
            String(f.properties.kd_kecamatan) === "041" &&
            allowedVillages[kelId]
          );
        });
        setRawDesaGeo({
          type: "FeatureCollection",
          features: filteredFeatures,
        });
      })
      .catch((err) => console.error("Gagal load desa:", err));

    fetch("/geo/32.05_kecamatan.geojson")
      .then((r) => r.json())
      .then((geoData) => {
        const filtered = {
          type: "FeatureCollection",
          features: geoData.features.filter(
            (f) => String(f.properties.kd_kecamatan) === "041"
          ),
        };
        setKecamatanGeo(filtered);
      })
      .catch((err) => console.error("Gagal load kecamatan:", err));
  }, []);

  // 2. MERGE DATA
  useEffect(() => {
    if (!rawDesaGeo) return;
    const dataBackend = semuaDesa?.rekap_per_desa || semuaDesa || {};

    const lookupTable = {};
    Object.keys(dataBackend).forEach((key) => {
      if (key) lookupTable[key.toUpperCase().trim()] = dataBackend[key];
    });

    let totalIndeks = 0;
    let countIndeks = 0;

    const featuresWithStats = rawDesaGeo.features.map((f) => {
      const namaAsli = f.properties.nm_kelurahan || f.properties.NAMOBJ;
      const namaKey = namaAsli ? namaAsli.toUpperCase().trim() : "";
      const stats = lookupTable[namaKey] || {};

      const s_rentan = stats.sangat_rentan || 0;
      const rentan = stats.rentan || 0;
      const t_rentan = stats.tidak_rentan || 0;
      const total = stats.total_kk || 1;

      const pct_sangat = (s_rentan / total) * 100;
      const pct_rentan = (rentan / total) * 100;
      const pct_tidak = (t_rentan / total) * 100;

      const indeks = stats.indeks_desa !== undefined ? stats.indeks_desa : 0;

      // Akumulasi untuk rata-rata sidebar
      if (stats.indeks_desa !== undefined) {
        totalIndeks += stats.indeks_desa;
        countIndeks++;
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          nama: namaAsli,
          jumlah_sangat_rentan: s_rentan,
          jumlah_rentan: rentan,
          jumlah_tidak_rentan: t_rentan,
          total_kk: total,
          pct_sangat_rentan: pct_sangat,
          pct_rentan: pct_rentan,
          pct_tidak_rentan: pct_tidak,
          indeks_desa: indeks,
          // pct_indeks_desa dipakai hanya untuk label map jika perlu
          pct_indeks_desa: indeks * 100,
        },
      };
    });

    // Hitung rata-rata jika data.rata_indeks_desa kosong
    if (countIndeks > 0) {
      setCalculatedAvgIndex(totalIndeks / countIndeks);
    }

    setDesaGeo({ type: "FeatureCollection", features: featuresWithStats });
  }, [rawDesaGeo, semuaDesa]);

  // --- HELPER LOGIC ---
  const getLabelTitle = () => {
    switch (activeCategory) {
      case "sangat_rentan":
        return "Sangat Rentan";
      case "rentan":
        return "Rentan";
      case "tidak_rentan":
        return "Tidak Rentan";
      case "indeks_desa":
        return "Indeks Desa";
      default:
        return "";
    }
  };

  // Helper untuk teks Legenda dinamis
  const getLegendLabel = (index) => {
    if (activeCategory === "indeks_desa") {
      // Label untuk Indeks (0.0 - 1.0)
      const labels = [
        "> 0.8 (Sangat Baik)",
        "> 0.7 (Baik)",
        "> 0.6 (Cukup)",
        "> 0.5 (Kurang)",
        "< 0.5 (Rentan)",
      ];
      return labels[index] || "";
    } else {
      // Label untuk Persentase (%)
      const labels = [
        "> 40% (Sangat Tinggi)",
        "> 30% (Tinggi)",
        "> 20% (Sedang)",
        "> 10% (Rendah)",
        "< 10% (Sangat Rendah)",
      ];
      return labels[index] || "";
    }
  };

  // 3. STYLE MAP
  const desaStyle = (feature) => {
    let val = 0;
    if (activeCategory === "indeks_desa") {
      val = feature.properties.indeks_desa ?? 0;
    } else {
      val = feature.properties[`pct_${activeCategory}`] || 0;
    }

    const isSelected = desa === feature.properties.nama.toUpperCase();
    const isAll = desa === "SEMUA";

    return {
      color: "#333",
      weight: isSelected ? 3 : 1,
      fillColor: getColor(val, activeCategory),
      fillOpacity: isSelected || isAll ? 0.8 : 0,
    };
  };

  const onEachDesa = (feature, layer) => {
    const p = feature.properties;

    // Perbaikan POPUP: Menambahkan Indeks Desa
    layer.bindTooltip(`${p.nama}`, { sticky: true });
    layer.bindPopup(`
      <div class="text-sm font-sans min-w-[220px]">
        <h3 class="font-bold text-lg mb-1 border-b pb-1">${p.nama}</h3>
        <p class="mb-2 text-gray-600">Total KK: <b class="text-black">${
          p.total_kk
        }</b></p>
        
        <div class="space-y-2">
           <div class="flex justify-between items-center bg-indigo-50 p-1.5 rounded border border-indigo-100">
             <span class="text-indigo-800 font-medium text-xs">Indeks Desa</span>
             <span class="font-bold text-indigo-700 text-sm">
               ${(p.indeks_desa || 0).toFixed(2)}
             </span>
           </div>

           <div class="flex justify-between items-center ${
             activeCategory === "sangat_rentan"
               ? "bg-red-50 p-1.5 rounded border border-red-100"
               : ""
           }">
             <span class="text-gray-700 text-xs">Sangat Rentan</span>
             <span class="font-bold text-red-700 text-xs">
               ${p.jumlah_sangat_rentan} (${p.pct_sangat_rentan.toFixed(1)}%)
             </span>
           </div>

           <div class="flex justify-between items-center ${
             activeCategory === "rentan"
               ? "bg-yellow-50 p-1.5 rounded border border-yellow-100"
               : ""
           }">
             <span class="text-gray-700 text-xs">Rentan</span>
             <span class="font-bold text-yellow-700 text-xs">
               ${p.jumlah_rentan} (${p.pct_rentan.toFixed(1)}%)
             </span>
           </div>

           <div class="flex justify-between items-center ${
             activeCategory === "tidak_rentan"
               ? "bg-green-50 p-1.5 rounded border border-green-100"
               : ""
           }">
             <span class="text-gray-700 text-xs">Tidak Rentan</span>
             <span class="font-bold text-green-700 text-xs">
               ${p.jumlah_tidak_rentan} (${p.pct_tidak_rentan.toFixed(1)}%)
             </span>
           </div>
        </div>
      </div>
    `);
    layer.on({ click: () => setSelected(p) });
  };

  if (!desaGeo) return <div className="p-10 text-center">Memuat Peta...</div>;

  const currentPalette = COLOR_PALETTES[activeCategory];

  // Gunakan data.rata_indeks_desa jika ada, jika tidak gunakan hasil hitungan manual
  const displayAvgIndex = data.rata_indeks_desa ?? calculatedAvgIndex;

  return (
    <div className="flex flex-col md:flex-row p-4 md:px-12 gap-6">
      {/* PETA */}
      <div className="w-full md:w-3/4 bg-white rounded-2xl shadow-lg border border-gray-200 p-2 h-[500px] md:h-[600px] flex flex-col relative">
        <div className="absolute top-4 right-4 z-[400] bg-white/90 backdrop-blur px-4 py-2 rounded shadow border border-gray-200">
          <span className="text-xs text-gray-500 uppercase font-bold">
            Mode Peta
          </span>
          <h2
            className={`text-lg font-bold ${
              activeCategory === "sangat_rentan"
                ? "text-red-600"
                : activeCategory === "indeks_desa"
                ? "text-indigo-600"
                : "text-green-600"
            }`}
          >
            {getLabelTitle()}
          </h2>
        </div>

        <MapContainer
          center={[-7.176573599307377, 108.0096028607914]}
          zoom={13}
          scrollWheelZoom={false}
          className="h-full w-full rounded-xl z-0"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsToGeoJSON geojson={desaGeo} />
          {kecamatanGeo && (
            <GeoJSON
              data={kecamatanGeo}
              style={{
                color: "#555",
                weight: 3,
                fillOpacity: 0,
                dashArray: "5, 5",
              }}
            />
          )}

          <GeoJSON
            data={desaGeo}
            style={desaStyle}
            onEachFeature={onEachDesa}
          />

          {desaGeo.features.map((f, idx) => {
            const center = getSafeCenter(f);
            if (!center) return null;

            // Logic label pada marker
            const isIndeks = activeCategory === "indeks_desa";
            const val = isIndeks
              ? (f.properties.indeks_desa || 0).toFixed(2)
              : (f.properties[`pct_${activeCategory}`] || 0).toFixed(1) + "%";

            return (
              <Marker
                key={`label-${idx}`}
                position={center}
                icon={L.divIcon({
                  className: "bg-transparent",
                  html: `
                    <div style="
                      background: rgba(255,255,255,0.85); 
                      padding: 2px 5px; 
                      border-radius: 4px; 
                      border: 1px solid #999;
                      font-size: 10px; 
                      font-weight: bold; 
                      text-align: center;
                      white-space: nowrap;
                      transform: translate(-50%, -50%);
                      color: #222;
                      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    ">
                      ${f.properties.nama}<br/>
                      <span style="font-size:11px; color:${
                        isIndeks ? "#4f46e5" : "#000"
                      }">
                        ${val}
                      </span>
                    </div>
                  `,
                })}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* SIDEBAR */}
      <aside className="w-full md:w-1/4 space-y-4">
        <div className="bg-white rounded-2xl shadow-md p-6 text-center border border-gray-100">
          <h3 className="text-gray-500 font-medium text-sm uppercase">
            Total Keluarga
          </h3>
          <span className="font-extrabold text-4xl text-gray-800 block mt-2">
            {data.total_keluarga || 0}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-4 flex flex-col gap-3 border border-gray-100">
          <p className="text-sm font-semibold text-gray-500 text-center mb-1">
            Pilih Kategori:
          </p>

          {/* Tombol Indeks Desa (Diperbaiki Angkanya) */}
          <button
            onClick={() => setActiveCategory("indeks_desa")}
            className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
              activeCategory === "indeks_desa"
                ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-sm">
                Indeks Desa
              </span>
              <span className="text-xs text-gray-500">Skor 0.0 - 1.0</span>
            </div>
            <span className="text-lg font-bold text-indigo-600">
              {/* Fallback ke calculatedAvgIndex jika data.rata_indeks_desa null */}
              {displayAvgIndex.toFixed(2)}
            </span>
          </button>

          {/* Tombol Sangat Rentan */}
          <button
            onClick={() => setActiveCategory("sangat_rentan")}
            className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
              activeCategory === "sangat_rentan"
                ? "bg-red-50 border-red-500 ring-1 ring-red-500"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-sm">
                Sangat Rentan
              </span>
            </div>
            <span className="text-lg font-bold text-red-600">
              {data.sangat_rentan || 0}
              <span className="text-xs font-normal text-gray-500 ml-1">
                ({((data.sangat_rentan / data.total_keluarga) * 100).toFixed(0)}
                %)
              </span>
            </span>
          </button>

          {/* Tombol Rentan */}
          <button
            onClick={() => setActiveCategory("rentan")}
            className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
              activeCategory === "rentan"
                ? "bg-yellow-50 border-yellow-500 ring-1 ring-yellow-500"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-sm">
                Rentan
              </span>
            </div>
            <span className="text-lg font-bold text-yellow-600">
              {data.rentan || 0}
            </span>
          </button>

          {/* Tombol Tidak Rentan */}
          <button
            onClick={() => setActiveCategory("tidak_rentan")}
            className={`flex items-center justify-between p-3 rounded-xl transition-all border ${
              activeCategory === "tidak_rentan"
                ? "bg-green-50 border-green-500 ring-1 ring-green-500"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >
            <div className="text-left">
              <span className="block font-bold text-gray-800 text-sm">
                Tidak Rentan
              </span>
            </div>
            <span className="text-lg font-bold text-green-600">
              {data.tidak_rentan || 0}
            </span>
          </button>
        </div>

        {/* LEGENDA DINAMIS */}
        <div className="bg-white rounded-xl shadow p-4 text-xs text-gray-500">
          <p className="font-bold mb-2">Legenda:</p>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-8 h-4 rounded shadow-sm border border-black/10"
                  style={{ backgroundColor: currentPalette[i] }}
                ></span>
                <span>{getLegendLabel(i)}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
