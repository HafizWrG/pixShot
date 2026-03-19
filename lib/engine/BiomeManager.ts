// BiomeManager.ts
// ... (deskripsi)

// Implementasi Perlin Noise sederhana
// Simple Perlin Noise implementation
class PerlinNoise {
    private p: number[];
    constructor() {
        this.p = new Array(512);
        const permutation = [ 151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190, 6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168, 68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54, 65,25,63,161, 1,216,80,73,209,76,132,187,208, 89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186, 3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152, 2,44,154,163, 70,221,153,101,155,167, 43,172,9,129,22,39,253, 19,98,108,110,79,113,224,232,178,185, 112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241, 81,51,145,235,249,14,239,107,49,192,214, 31,181,199,106,157,184, 84,204,176,115,121,50,45,127, 4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180 ];
        for (let i=0; i < 256 ; i++) this.p[256+i] = this.p[i] = permutation[i];
    }
    private fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
    private lerp(t: number, a: number, b: number) { return a + t * (b - a); }
    private grad(hash: number, x: number, y: number, z: number) {
        const h = hash & 15;
        const u = h<8 ? x : y, v = h<4 ? y : h==12||h==14 ? x : z;
        return ((h&1) == 0 ? u : -u) + ((h&2) == 0 ? v : -v);
    }
    public noise(x: number, y: number, z: number) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        const A = this.p[X]+Y, AA = this.p[A]+Z, AB = this.p[A+1]+Z,
              B = this.p[X+1]+Y, BA = this.p[B]+Z, BB = this.p[B+1]+Z;
        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x-1, y, z)),
                                     this.lerp(u, this.grad(this.p[AB], x, y-1, z), this.grad(this.p[BB], x-1, y-1, z))),
                           this.lerp(v, this.lerp(u, this.grad(this.p[AA+1], x, y, z-1), this.grad(this.p[BA+1], x-1, y, z-1)),
                                     this.lerp(u, this.grad(this.p[AB+1], x, y-1, z-1), this.grad(this.p[BB+1], x-1, y-1, z-1))));
    }
}

// Tipe data untuk definisi Bioma

// Tipe data untuk definisi Bioma
// Data type for Biome definitions
type Biome = {
    name: 'plains' | 'forest' | 'village' | 'rocky';
    // Kepadatan pohon (0-1)
    treeDensity: number;
    // Kepadatan rumah (0-1)
    houseDensity: number;
    // Tipe shape yang umum
    commonShapes: string[];
};

// Tipe data untuk setiap sel dalam grid
// Data type for each cell in the grid
type GridCell = {
    biome: Biome;
    // Daftar objek yang ada di dalam sel ini
    objects: any[];
};

export class BiomeManager {
    private gridSize: number;
    private worldSize: number;
    private grid: GridCell[][];
    private biomes: Record<string, Biome>;
    private noise: PerlinNoise;

    constructor(worldSize: number, gridSize: number) {
        this.worldSize = worldSize;
        this.gridSize = gridSize;
        this.grid = [];
        this.noise = new PerlinNoise();
        
        // Inisialisasi definisi bioma (Kepadatan dikurangi sesuai permintaan)
        // Initialize biome definitions (Density reduced as per request)
        this.biomes = {
            plains: { name: 'plains', treeDensity: 0.02, houseDensity: 0.005, commonShapes: ['wood'] },
            forest: { name: 'forest', treeDensity: 0.6, houseDensity: 0.01, commonShapes: ['wood', 'leaf'] },
            village: { name: 'village', treeDensity: 0.1, houseDensity: 0.4, commonShapes: ['wood', 'stone'] },
            rocky: { name: 'rocky', treeDensity: 0.01, houseDensity: 0.03, commonShapes: ['stone', 'gold'] },
        };
    }

    /**
     * Menghasilkan seluruh lingkungan (pohon, rumah) berdasarkan peta bioma.
     * Generates the entire environment (trees, houses) based on the biome map.
     */
    public generateEnvironment(): any[] {
        console.log('[BiomeManager] Starting environment generation...');
        
        // Langkah 1: Buat peta bioma (Untuk sekarang, kita gunakan placeholder acak)
        // Step 1: Create the biome map (For now, we'll use a random placeholder)
        this.generateBiomeMap();

        // Langkah 2: Tempatkan objek berdasarkan bioma di setiap sel
        // Step 2: Place objects based on the biome in each cell
        const environmentObjects: any[] = [];
        const minDistance = 30; // Jarak minimum antar objek

        this.grid.forEach((column, i) => {
            column.forEach((cell, j) => {
                const halfSize = this.worldSize / 2;
                const cellX = -halfSize + i * this.gridSize;
                const cellY = -halfSize + j * this.gridSize;
                const biome = cell.biome;

                // Hitung jumlah objek untuk sel ini
                const numTrees = Math.floor((this.gridSize * this.gridSize) / 40000 * biome.treeDensity * 10);
                const numHouses = Math.floor((this.gridSize * this.gridSize) / 40000 * biome.houseDensity * 5);

                // Tempatkan pohon
                for (let k = 0; k < numTrees; k++) {
                    this.tryPlaceObject(environmentObjects, 'tree', 60, cellX, cellY, minDistance);
                }

                // Tempatkan rumah
                for (let k = 0; k < numHouses; k++) {
                    this.tryPlaceObject(environmentObjects, 'house', 150, cellX, cellY, minDistance);
                }
            });
        });

        console.log(`[BiomeManager] Environment generation complete. Created ${environmentObjects.length} objects.`);
        return environmentObjects;
    }

    /**
     * Mencoba menempatkan satu objek di dalam sel, memastikan tidak tumpang tindih.
     * Tries to place a single object within a cell, ensuring it doesn't overlap.
     */
    private tryPlaceObject(allObjects: any[], type: string, radius: number, cellX: number, cellY: number, minDistance: number) {
        const maxAttempts = 10;
        for (let i = 0; i < maxAttempts; i++) {
            const x = cellX + Math.random() * this.gridSize;
            const y = cellY + Math.random() * this.gridSize;

            // Pastikan tidak di luar batas dunia
            const halfSize = this.worldSize / 2;
            if (x > halfSize - radius || y > halfSize - radius || x < -halfSize + radius || y < -halfSize + radius) {
                continue;
            }

            let isValidPosition = true;
            // Pemeriksaan tabrakan yang efisien menggunakan getNearbyObjects
            const nearbyObjects = this.getNearbyObjects(x, y, radius * 2);
            for (const other of nearbyObjects) {
                const distance = Math.hypot(x - other.x, y - other.y);
                if (distance < radius + other.r + minDistance) {
                    isValidPosition = false;
                    break;
                }
            }

            if (isValidPosition) {
                const newObject = { type, x, y, r: radius };
                allObjects.push(newObject);
                this.addObjectToGrid(newObject);
                return true; // Berhasil ditempatkan
            }
        }
        return false; // Gagal menempatkan setelah beberapa kali percobaan
    }

    /**
     * Membuat peta bioma untuk seluruh dunia menggunakan noise.
     * Creates a biome map for the entire world using noise.
     */
    private generateBiomeMap() {
        const cells = this.worldSize / this.gridSize;
        const scale = 10; // Skala noise, angka lebih kecil = fitur lebih besar
        console.log(`[BiomeManager] Creating a ${cells}x${cells} grid using Perlin Noise...`);

        for (let i = 0; i < cells; i++) {
            this.grid[i] = [];
            for (let j = 0; j < cells; j++) {
                const nx = i / cells * scale;
                const ny = j / cells * scale;

                // Hasilkan dua nilai noise: satu untuk elevasi, satu untuk kelembapan
                const elevation = this.noise.noise(nx, ny, 0);
                const moisture = this.noise.noise(nx + 100, ny + 100, 0); // Offset untuk peta noise yang berbeda

                let biome: Biome;
                if (elevation > 0.6) {
                    biome = this.biomes.rocky;
                } else if (moisture > 0.5) {
                    biome = this.biomes.forest;
                } else {
                    biome = this.biomes.plains;
                }

                // Peluang kecil untuk menimpa bioma dengan desa
                if (biome.name !== 'rocky' && this.noise.noise(nx + 200, ny + 200, 0) > 0.75) {
                    biome = this.biomes.village;
                }

                this.grid[i][j] = {
                    biome: biome,
                    objects: [],
                };
            }
        }
    }

    /**
     * Menambahkan objek ke sel grid yang sesuai.
     * Adds an object to the appropriate grid cell.
     */
    public addObjectToGrid(obj: any) {
        const halfSize = this.worldSize / 2;
        const cellX = Math.floor((obj.x + halfSize) / this.gridSize);
        const cellY = Math.floor((obj.y + halfSize) / this.gridSize);
        
        if (this.grid[cellX] && this.grid[cellX][cellY]) {
            this.grid[cellX][cellY].objects.push(obj);
        }
    }

    /**
     * Mendapatkan objek di sekitar posisi tertentu untuk pemeriksaan tabrakan yang efisien.
     * Gets objects around a certain position for efficient collision checks.
     */
    public getNearbyObjects(x: number, y: number, radius: number): any[] {
        const nearbyObjects: any[] = [];
        const halfSize = this.worldSize / 2;
        const cellX = Math.floor((x + halfSize) / this.gridSize);
        const cellY = Math.floor((y + halfSize) / this.gridSize);
        const searchRadius = Math.ceil(radius / this.gridSize);

        for (let i = -searchRadius; i <= searchRadius; i++) {
            for (let j = -searchRadius; j <= searchRadius; j++) {
                const checkX = cellX + i;
                const checkY = cellY + j;
                if (this.grid[checkX] && this.grid[checkX][checkY]) {
                    nearbyObjects.push(...this.grid[checkX][checkY].objects);
                }
            }
        }
        return nearbyObjects;
    }
}