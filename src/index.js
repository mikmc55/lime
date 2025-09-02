// Optimized Cloudflare Worker for UIndex + Premiumize Integration
// Using improved scraping logic from uiai.js

const TMDB_API_KEY = 'f051e7366c6105ad4f9aafe4733d9dae';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const HARDCODED_PREMIUMIZE_KEY = '9jhjt3i7uxhu2xh7';

// ✅ Improved HTML Entity Decoder
function decodeHtmlEntities(text) {
    const entities = {
        '&amp;': '&',
        '&lt;': '<', 
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&nbsp;': ' ',
        '&#8217;': "'",
        '&#8220;': '"',
        '&#8221;': '"',
        '&#8211;': '–',
        '&#8212;': '—'
    };
    
    return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

// ✅ Enhanced Query Cleaning (from uiai.js)
function cleanSearchQuery(query) {
    console.log(`🧹 Cleaning query: "${query}"`);
    
    // Remove IMDb ID pattern if present
    if (query.match(/^tt\d+$/)) {
        console.log(`⚠️ Raw IMDb ID detected: ${query}. This should be converted to movie title before calling scraper.`);
        return null;
    }
    
    // Clean up the query for better search results
    const cleaned = query
        .replace(/\s*\(\d{4}\)\s*$/, '') // Remove year at the end
        .replace(/[^\w\s.-]/g, ' ') // Replace special chars with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    console.log(`✨ Cleaned query: "${cleaned}"`);
    return cleaned;
}

// ✅ Enhanced Quality Extraction
function extractQuality(title) {
    if (!title) return '';
    
    // More comprehensive quality patterns
    const qualityPatterns = [
        /\b(2160p|4k|uhd)\b/i,
        /\b(1080p)\b/i,
        /\b(720p)\b/i,
        /\b(480p|sd)\b/i,
        /\b(webrip|web-rip)\b/i,
        /\b(bluray|blu-ray|bdremux|bd)\b/i,
        /\b(remux)\b/i,
        /\b(hdrip|hdr)\b/i,
        /\b(cam|ts|tc)\b/i
    ];
    
    for (const pattern of qualityPatterns) {
        const match = title.match(pattern);
        if (match) return match[1].toLowerCase();
    }
    
    return '';
}

// ✅ Improved Info Hash Extraction
function extractInfoHash(magnet) {
    if (!magnet) return null;
    const match = magnet.match(/btih:([A-Fa-f0-9]{40}|[A-Za-z2-7]{32})/i);
    if (!match) return null;
    
    // Convert base32 to hex if needed
    if (match[1].length === 32) {
        // This is base32, convert to hex (simplified)
        return match[1].toUpperCase();
    }
    
    return match[1].toUpperCase();
}

// ✅ Enhanced Size Parsing
function parseSize(sizeStr) {
    if (!sizeStr || sizeStr === '-' || sizeStr.toLowerCase() === 'unknown') return 0;
    
    const match = sizeStr.match(/([\d.,]+)\s*(B|KB|MB|GB|TB|KiB|MiB|GiB|TiB)/i);
    if (!match) return 0;
    
    const [, value, unit] = match;
    const cleanValue = parseFloat(value.replace(',', '.'));
    
    const multipliers = {
        'B': 1,
        'KB': 1024, 'KIB': 1024,
        'MB': 1024 ** 2, 'MIB': 1024 ** 2,
        'GB': 1024 ** 3, 'GIB': 1024 ** 3,  
        'TB': 1024 ** 4, 'TIB': 1024 ** 4
    };
    
    return cleanValue * (multipliers[unit.toUpperCase()] || 1);
}

// ✅ Advanced HTML Parsing (inspired by JSDOM approach in uiai.js)
function parseUIndexHTML(html) {
    const results = [];
    
    // Split by table rows and filter for torrent rows
    const rows = html.split(/<tr[^>]*>/gi).filter(row => 
        row.includes('magnet:?xt=urn:btih:') && 
        row.includes('<td')
    );
    
    console.log(`📊 Processing ${rows.length} potential torrent rows`);
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        try {
            // Extract magnet link with better regex
            const magnetMatch = row.match(/href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i);
            if (!magnetMatch) continue;
            
            let magnetLink = decodeHtmlEntities(magnetMatch[1]);
            
            // Parse table cells more reliably
            const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;
            const cells = [];
            let cellMatch;
            
            while ((cellMatch = cellRegex.exec(row)) !== null) {
                cells.push(cellMatch[1].trim());
            }
            
            if (cells.length < 3) continue;
            
            // Extract title - try multiple patterns
            let title = "";
            const titleCell = cells[1] || "";
            
            // Pattern 1: details.php link
            const detailsMatch = titleCell.match(/<a[^>]*href=["']\/details\.php[^"']*["'][^>]*>([^<]+)<\/a>/i);
            if (detailsMatch) {
                title = detailsMatch[1].trim();
            } else {
                // Pattern 2: Second anchor tag
                const anchors = titleCell.match(/<a[^>]*>([^<]+)<\/a>/gi);
                if (anchors && anchors.length >= 2) {
                    const secondAnchor = anchors[1].match(/>([^<]+)</);
                    if (secondAnchor) title = secondAnchor[1].trim();
                } else if (anchors && anchors.length === 1) {
                    const singleAnchor = anchors[0].match(/>([^<]+)</);
                    if (singleAnchor) title = singleAnchor[1].trim();
                }
            }
            
            // Clean title
            title = decodeHtmlEntities(title);
            
            // Extract size from third cell
            let sizeStr = "Unknown";
            const sizeCell = cells[2] || "";
            const sizeMatch = sizeCell.match(/([\d.,]+\s*(?:B|KB|MB|GB|TB|KiB|MiB|GiB|TiB))/i);
            if (sizeMatch) {
                sizeStr = sizeMatch[1].trim();
            }
            
            // Extract category
            let category = "Unknown";
            const categoryCell = cells[0] || "";
            const categoryMatch = categoryCell.match(/<a[^>]*>([^<]+)<\/a>/i);
            if (categoryMatch) {
                category = decodeHtmlEntities(categoryMatch[1].trim());
            }
            
            // Extract seeders/leechers if available (usually in later cells)
            let seeders = 0, leechers = 0;
            if (cells.length > 4) {
                const seedMatch = cells[4]?.match(/(\d+)/);
                if (seedMatch) seeders = parseInt(seedMatch[1]);
            }
            if (cells.length > 5) {
                const leechMatch = cells[5]?.match(/(\d+)/);
                if (leechMatch) leechers = parseInt(leechMatch[1]);
            }
            
            // Skip if essential data is missing
            if (!title || title.length < 3 || !magnetLink) continue;
            
            const sizeInBytes = parseSize(sizeStr);
            const infoHash = extractInfoHash(magnetLink);
            
            if (!infoHash) {
                console.log(`⚠️ Skipping result without valid info hash: ${title}`);
                continue;
            }
            
            results.push({
                magnetLink,
                title,
                size: sizeStr,
                category,
                quality: extractQuality(title),
                infoHash,
                seeders,
                leechers,
                sizeInBytes,
                source: 'UIndex'
            });
            
            console.log(`✅ Parsed: ${title} (${sizeStr}) - ${infoHash}`);
            
        } catch (error) {
            console.error(`❌ Error parsing row ${i}:`, error.message);
            continue;
        }
    }
    
    console.log(`📊 Successfully parsed ${results.length} torrents`);
    return results;
}

// ✅ Multi-Strategy Search (try different query variations)
async function searchUIndexMultiStrategy(originalQuery, type = 'movie') {
    const searchStrategies = [];
    
    // Strategy 1: Original query
    const cleanedOriginal = cleanSearchQuery(originalQuery);
    if (cleanedOriginal) {
        searchStrategies.push({
            query: cleanedOriginal,
            description: 'Original cleaned'
        });
    }
    
    // Strategy 2: Remove extra words for movies
    if (type === 'movie') {
        const simplified = cleanedOriginal?.replace(/\b(movie|film|dvd|bluray|bd)\b/gi, '').trim();
        if (simplified && simplified !== cleanedOriginal) {
            searchStrategies.push({
                query: simplified,
                description: 'Simplified movie'
            });
        }
    }
    
    // Strategy 3: For series, try alternative episode format
    if (type === 'series' && originalQuery.includes('S') && originalQuery.includes('E')) {
        const altFormat = originalQuery.replace(/S(\d+)E(\d+)/i, '$1x$2');
        if (altFormat !== originalQuery) {
            searchStrategies.push({
                query: cleanSearchQuery(altFormat),
                description: 'Alternative episode format'
            });
        }
    }
    
    let allResults = [];
    const seenHashes = new Set();
    
    for (const strategy of searchStrategies) {
        if (!strategy.query) continue;
        
        console.log(`🔍 Trying strategy: ${strategy.description} - "${strategy.query}"`);
        
        try {
            const results = await fetchUIndexSingle(strategy.query);
            
            // Deduplicate by info hash
            const newResults = results.filter(result => {
                if (!result.infoHash || seenHashes.has(result.infoHash)) return false;
                seenHashes.add(result.infoHash);
                return true;
            });
            
            console.log(`📊 Strategy "${strategy.description}" found ${newResults.length} unique results`);
            allResults.push(...newResults);
            
            // If we got good results, don't try too many more strategies
            if (allResults.length >= 20) break;
            
        } catch (error) {
            console.error(`❌ Strategy "${strategy.description}" failed:`, error.message);
            continue;
        }
        
        // Small delay between strategies
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎉 Multi-strategy search found ${allResults.length} total unique results`);
    return allResults;
}

// ✅ Single UIndex Search with Enhanced Error Handling
async function fetchUIndexSingle(searchQuery) {
    try {
        console.log(`🔍 Searching UIndex for: "${searchQuery}"`);
        
        const searchUrl = `https://uindex.org/search.php?search=${encodeURIComponent(searchQuery)}&c=0`;
        
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Cache-Control': 'no-cache'
            },
            cf: {
                cacheEverything: false,
                cacheTtl: 0
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Basic validation
        if (!html.includes('<table') || !html.includes('magnet:')) {
            console.log('⚠️ Page doesn\'t contain expected torrent table');
            return [];
        }
        
        return parseUIndexHTML(html);
        
    } catch (error) {
        console.error(`❌ Error fetching from UIndex:`, error);
        return [];
    }
}

// ✅ Enhanced Result Processing and Sorting
function processAndSortResults(results) {
    // Filter out invalid results
    const validResults = results.filter(result => 
        result.title && 
        result.title.length > 3 && 
        result.infoHash && 
        result.infoHash.length >= 32
    );
    
    // Sort by quality first, then by size, then by seeders
    validResults.sort((a, b) => {
        const qualityOrder = { 
            '2160p': 6, '4k': 6, 'uhd': 6,
            'remux': 5,
            '1080p': 4, 
            '720p': 3, 
            'webrip': 2,
            '480p': 1,
            'cam': 0, 'ts': 0, 'tc': 0
        };
        
        const qualityDiff = (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        if (qualityDiff !== 0) return qualityDiff;
        
        // Then by file size
        const sizeDiff = (b.sizeInBytes || 0) - (a.sizeInBytes || 0);
        if (sizeDiff !== 0) return sizeDiff;
        
        // Finally by seeders
        return (b.seeders || 0) - (a.seeders || 0);
    });
    
    return validResults;
}

// ✅ WORKING Premiumize API integration (unchanged)
class Premiumize {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://www.premiumize.me/api';
    }

    static canHandle(apiKey) {
        return apiKey && apiKey.startsWith('pr=') || apiKey.length > 10;
    }

    async checkCacheStatuses(hashes) {
        if (!hashes || hashes.length === 0) return {};
        
        const results = {};
        const batchSize = 99;
        
        for (let i = 0; i < hashes.length; i += batchSize) {
            const batch = hashes.slice(i, i + batchSize);
            const params = new URLSearchParams();
            
            batch.forEach(hash => params.append('items[]', hash));
            params.append('apikey', this.apiKey.replace('pr=', '') || this.apiKey);

            try {
                const response = await fetch(`${this.baseUrl}/cache/check?${params}`);
                const data = await response.json();

                if (data.status === 'success') {
                    batch.forEach((hash, index) => {
                        results[hash] = {
                            cached: data.response[index],
                            service: 'Premiumize'
                        };
                    });
                }

                if (i + batchSize < hashes.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (error) {
                console.error('Cache check failed:', error);
                batch.forEach(hash => {
                    results[hash] = { cached: false, service: 'Premiumize' };
                });
            }
        }

        return results;
    }

    async getStreamUrl(magnetLink) {
        const formData = new URLSearchParams();
        formData.append('src', magnetLink);
        formData.append('apikey', this.apiKey.replace('pr=', '') || this.apiKey);

        const response = await fetch(`${this.baseUrl}/transfer/directdl`, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        if (!response.ok) {
            throw new Error(`Premiumize API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(`Premiumize error: ${data.message}`);
        }

        const bestFile = this.findBestVideoFile(data.content);
        if (!bestFile) {
            throw new Error('No suitable video file found');
        }

        return bestFile.stream_link || bestFile.link;
    }

    findBestVideoFile(files) {
        if (!files || files.length === 0) return null;
        
        const videoFiles = files.filter(file => {
            const ext = file.path.split('.').pop().toLowerCase();
            return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext);
        });
        
        if (videoFiles.length === 0) return null;
        
        return videoFiles.reduce((best, current) => 
            current.size > best.size ? current : best
        );
    }
}

// ✅ Helper functions (unchanged)
function getQualitySymbol(quality) {
    const qualityStr = String(quality).toLowerCase();
    
    if (qualityStr.includes('2160') || qualityStr.includes('4k') || qualityStr.includes('uhd')) {
        return '🔥';
    } else if (qualityStr.includes('1080')) {
        return '⭐';
    } else if (qualityStr.includes('720')) {
        return '✅';
    } else if (qualityStr.includes('480')) {
        return '📺';
    } else {
        return '🎬';
    }
}

function extractImdbId(id) {
    if (id.startsWith('tt')) return id;
    if (id.match(/^\d+$/)) return `tt${id}`;
    return null;
}

async function getTMDBDetailsByImdb(imdbId) {
    try {
        const response = await fetch(`${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
        const data = await response.json();
        
        if (data.movie_results?.[0]) {
            const movie = data.movie_results[0];
            const year = new Date(movie.release_date).getFullYear();
            return {
                title: movie.title,
                year: year,
                type: 'movie'
            };
        }
        
        if (data.tv_results?.[0]) {
            const show = data.tv_results[0];
            const year = new Date(show.first_air_date).getFullYear();
            return {
                title: show.name,
                year: year,
                type: 'series'
            };
        }
        
        return null;
    } catch (error) {
        console.error('TMDB fetch error:', error);
        return null;
    }
}

// ✅ Enhanced caching with better cleanup
const cache = new Map();
const CACHE_TTL = 1800000; // 30 minutes
const MAX_CACHE_ENTRIES = 1000;

function cleanupCache() {
    const now = Date.now();
    const entries = Array.from(cache.entries());
    
    // Remove expired entries
    const validEntries = entries.filter(([key, { timestamp }]) => 
        now - timestamp <= CACHE_TTL
    );
    
    // If still too many entries, remove oldest
    if (validEntries.length > MAX_CACHE_ENTRIES) {
        validEntries.sort((a, b) => b[1].timestamp - a[1].timestamp);
        validEntries.splice(MAX_CACHE_ENTRIES);
    }
    
    // Rebuild cache
    cache.clear();
    validEntries.forEach(([key, value]) => cache.set(key, value));
    
    console.log(`🧹 Cache cleanup: kept ${cache.size} entries`);
}

let lastCleanup = 0;
function maybeCleanupCache() {
    const now = Date.now();
    if (now - lastCleanup > 300000) { // Every 5 minutes
        cleanupCache();
        lastCleanup = now;
    }
}

// ✅ Enhanced main fetch function
async function fetchUIndexData(searchQuery, type = 'movie') {
    console.log(`🔄 Fetching UIndex results for: "${searchQuery}" (type: ${type})`);

    // Check cache first
    const cacheKey = `${searchQuery}:${type}`;
    if (cache.has(cacheKey)) {
        const cached = cache.get(cacheKey);
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`⚡ Using cached results for: "${searchQuery}"`);
            return cached.data;
        } else {
            cache.delete(cacheKey);
        }
    }

    try {
        // Use multi-strategy search for better results
        const rawResults = await searchUIndexMultiStrategy(searchQuery, type);
        
        if (!rawResults.length) {
            console.log('⚠️ No results found from any search strategy');
            return [];
        }

        // Process and sort results
        const processedResults = processAndSortResults(rawResults);
        
        // Convert to expected format
        const formattedResults = processedResults.map(result => ({
            magnetLink: result.magnetLink,
            websiteTitle: result.title,
            title: result.title,
            filename: result.title,
            quality: result.quality,
            size: result.size,
            source: result.source,
            seeders: result.seeders,
            leechers: result.leechers,
            infoHash: result.infoHash,
            mainFileSize: result.sizeInBytes,
            pubDate: new Date().toISOString(),
            categories: [result.category]
        }));

        // Cache results
        cache.set(cacheKey, {
            data: formattedResults,
            timestamp: Date.now()
        });

        console.log(`🎉 Successfully processed ${formattedResults.length} results for "${searchQuery}"`);
        return formattedResults;

    } catch (error) {
        console.error('❌ Error in fetchUIndexData:', error);
        return [];
    }
}

// ✅ Matching functions (unchanged but improved logging)
function isExactEpisodeMatch(torrentTitle, showTitle, seasonNum, episodeNum) {
    if (!torrentTitle || !showTitle) return false;
    
    torrentTitle = torrentTitle.replace(/<[^>]*>/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    const normalizedTorrentTitle = torrentTitle.toLowerCase();
    const normalizedShowTitle = showTitle.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    const showWords = normalizedShowTitle.split(' ')
        .filter(word => word.length > 2)
        .filter(word => !['the', 'and', 'or', 'in', 'on', 'at', 'to'].includes(word));
    
    const matchingWords = showWords.filter(word => 
        normalizedTorrentTitle.includes(word)
    );
    
    const percentageMatch = matchingWords.length / showWords.length;
    const hasEnoughShowWords = percentageMatch >= 0.6;
    
    if (!hasEnoughShowWords) {
        console.log(`❌ Show match failed for "${torrentTitle}" - ${percentageMatch.toFixed(2)} match`);
        return false;
    }
    
    const seasonStr = String(seasonNum).padStart(2, '0');
    const episodeStr = String(episodeNum).padStart(2, '0');
    
    const patterns = [
        new RegExp(`s${seasonStr}e${episodeStr}`, 'i'),
        new RegExp(`${seasonNum}x${episodeStr}`, 'i'),
        new RegExp(`[^0-9]${seasonNum}${episodeStr}[^0-9]`, 'i'),
        new RegExp(`season\\s*${seasonNum}\\s*episode\\s*${episodeNum}`, 'i'),
        new RegExp(`s${seasonStr}\\.?e${episodeStr}`, 'i'),
        new RegExp(`${seasonStr}${episodeStr}`, 'i')
    ];
        
    const matches = patterns.some(pattern => pattern.test(normalizedTorrentTitle));
    console.log(`${matches ? '✅' : '❌'} Episode match for "${torrentTitle}" S${seasonStr}E${episodeStr}`);
    return matches;
}

function isExactMovieMatch(torrentTitle, movieTitle, year) {
    if (!torrentTitle || !movieTitle) return false;
    
    torrentTitle = torrentTitle.replace(/<[^>]*>/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    const normalizedTorrentTitle = torrentTitle.toLowerCase();
    const normalizedMovieTitle = movieTitle.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    const movieWords = normalizedMovieTitle.split(' ')
        .filter(word => word.length > 2)
        .filter(word => !['the', 'and', 'or', 'in', 'on', 'at', 'to'].includes(word));
    
    const matchingWords = movieWords.filter(word => 
        normalizedTorrentTitle.includes(word)
    );
    
    const percentageMatch = matchingWords.length / movieWords.length;
    const hasEnoughMovieWords = percentageMatch >= 0.7;
    
    if (!hasEnoughMovieWords) {
        console.log(`❌ Movie match failed for "${torrentTitle}" - ${percentageMatch.toFixed(2)} match`);
        return false;
    }
    
    const yearMatch = torrentTitle.match(/(?:19|20)\d{2}/);
    
    const yearMatches = !yearMatch || 
           yearMatch[0] === year.toString() || 
           Math.abs(parseInt(yearMatch[0]) - parseInt(year)) <= 1;
           
    console.log(`${yearMatches ? '✅' : '❌'} Year match for "${torrentTitle}" (${year})`);
    return yearMatches;
}

// ✅ Enhanced stream handler with better error handling and logging
async function handleStream(type, id, env) {
    maybeCleanupCache();
    
    console.log(`\n🎯 Processing ${type} with ID: ${id}`);
    
    const startTime = Date.now();
    
    try {
        const premiumize = new Premiumize(HARDCODED_PREMIUMIZE_KEY);
        
        let imdbId = id;
        let season = null;
        let episode = null;
        
        if (type === 'series') {
            const parts = id.split(':');
            imdbId = parts[0];
            season = parts[1];
            episode = parts[2];
            
            if (!season || !episode) {
                console.log('❌ Invalid series format');
                return { streams: [] };
            }
        }
        
        const cleanImdbId = extractImdbId(imdbId);
        if (!cleanImdbId) {
            console.log('❌ Invalid IMDB ID format');
            return { streams: [] };
        }
        
        console.log(`🔍 Looking up TMDB details for: ${cleanImdbId}`);
        const mediaDetails = await getTMDBDetailsByImdb(cleanImdbId);
        if (!mediaDetails) {
            console.log('❌ Could not find media details');
            return { streams: [] };
        }
        
        console.log(`✅ Found: ${mediaDetails.title} (${mediaDetails.year})`);
        
        let searchQuery = `${mediaDetails.title} ${mediaDetails.year}`;
        if (type === 'series') {
            searchQuery += ` S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`;
        }
        
        console.log(`🔍 Searching UIndex for: "${searchQuery}"`);
        
        const results = await fetchUIndexData(searchQuery, type === 'movie' ? 'movie' : 'series');
        
        if (!results || results.length === 0) {
            console.log('❌ No results found from UIndex');
            return { streams: [] };
        }
        
        console.log(`📡 Found ${results.length} torrents from UIndex`);
        
        // ✅ Apply exact matching filters
        let filteredResults = results;
        
        if (type === 'series') {
            const originalCount = filteredResults.length;
            filteredResults = filteredResults.filter(result => 
                isExactEpisodeMatch(
                    result.title || result.websiteTitle,
                    mediaDetails.title,
                    parseInt(season),
                    parseInt(episode)
                )
            );
            console.log(`📺 Episode filtering: ${filteredResults.length} of ${originalCount} results match`);
            
            // If exact matching removed too many results, be more lenient
            if (filteredResults.length === 0 && originalCount > 0) {
                console.log('⚠️ Exact filtering removed all results, using broader match');
                filteredResults = results.slice(0, Math.min(10, results.length));
            }
        } else if (type === 'movie') {
            const originalCount = filteredResults.length;
            filteredResults = filteredResults.filter(result => 
                isExactMovieMatch(
                    result.title || result.websiteTitle,
                    mediaDetails.title,
                    mediaDetails.year
                )
            );
            console.log(`🎬 Movie filtering: ${filteredResults.length} of ${originalCount} results match`);
            
            // If exact matching removed too many results, be more lenient
            if (filteredResults.length === 0 && originalCount > 0) {
                console.log('⚠️ Exact filtering removed all results, using broader match');
                filteredResults = results.slice(0, Math.min(15, results.length));
            }
        }
        
        // Limit results for performance
        const maxResults = 25;
        filteredResults = filteredResults.slice(0, maxResults);
        
        console.log(`🔄 Checking Premiumize cache for ${filteredResults.length} results...`);
        const hashes = filteredResults.map(t => t.infoHash).filter(h => h && h.length >= 32);
        
        if (hashes.length === 0) {
            console.log('❌ No valid info hashes found');
            return { streams: [] };
        }
        
        const cacheResults = await premiumize.checkCacheStatuses(hashes);
        console.log(`✅ Cache check complete for ${hashes.length} hashes`);
        
        // ✅ Build streams with enhanced error handling
        const streams = await Promise.all(
            filteredResults.map(async (result, index) => {
                try {
                    const qualityDisplay = result.quality ? result.quality.toUpperCase() : 'Unknown';
                    const qualitySymbol = getQualitySymbol(qualityDisplay);
                    
                    let streamUrl = result.magnetLink;
                    let cached = false;
                    let streamError = null;
                    
                    // Check if cached and get stream URL
                    const cacheData = cacheResults[result.infoHash];
                    if (cacheData?.cached) {
                        cached = true;
                        try {
                            console.log(`⚡ Getting stream URL for cached torrent: ${result.title}`);
                            streamUrl = await premiumize.getStreamUrl(result.magnetLink);
                            console.log(`✅ Got Premiumize stream URL`);
                        } catch (error) {
                            console.error(`❌ Failed to get stream URL for ${result.title}:`, error.message);
                            streamUrl = result.magnetLink;
                            cached = false;
                            streamError = error.message;
                        }
                    }
                    
                    const cachedIcon = cached ? '⚡ ' : '';
                    const errorIcon = streamError ? '⚠️ ' : '';
                    
                    // Enhanced stream name with more info
                    const streamName = [
                        cachedIcon + errorIcon,
                        qualitySymbol,
                        qualityDisplay,
                        result.size,
                        `👥 ${result.seeders || 0}/${result.leechers || 0}`,
                        'UIndex'
                    ].filter(Boolean).join(' | ');
                    
                    // Enhanced stream title with debugging info
                    const debugInfo = streamError ? `\n⚠️ Stream error: ${streamError}` : '';
                    const cacheInfo = cached ? 'Instant streaming via Premiumize' : 'Download via magnet link';
                    
                    const streamTitle = [
                        `🎬 ${result.title}`,
                        `📡 ${result.source} | 🌱 ${result.seeders || 0} seeds | 🔥 ${result.leechers || 0} peers`,
                        `⚡ ${cacheInfo}`,
                        result.categories?.[0] ? `📂 ${result.categories[0]}` : '',
                        debugInfo
                    ].filter(Boolean).join('\n');
                    
                    return {
                        name: streamName,
                        title: streamTitle,
                        url: streamUrl,
                        behaviorHints: {
                            bingeGroup: 'uindex-premiumize-optimized',
                            notWebReady: !cached
                        },
                        // Add metadata for debugging
                        _meta: {
                            infoHash: result.infoHash,
                            cached: cached,
                            originalSize: result.size,
                            quality: result.quality,
                            seeders: result.seeders,
                            error: streamError
                        }
                    };
                } catch (error) {
                    console.error(`❌ Error processing result ${index}:`, error);
                    
                    // Return a basic stream even if processing failed
                    return {
                        name: `❌ ${result.title} (Error)`,
                        title: `Error processing: ${error.message}`,
                        url: result.magnetLink,
                        behaviorHints: {
                            bingeGroup: 'uindex-premiumize-optimized',
                            notWebReady: true
                        }
                    };
                }
            })
        );
        
        // ✅ Enhanced sorting: cached first, then by quality, then by seeders
        streams.sort((a, b) => {
            const aCached = a.name.includes('⚡');
            const bCached = b.name.includes('⚡');
            const aError = a.name.includes('❌');
            const bError = b.name.includes('❌');
            
            // Errors go to bottom
            if (aError && !bError) return 1;
            if (!aError && bError) return -1;
            
            // Cached streams go to top
            if (aCached && !bCached) return -1;
            if (!aCached && bCached) return 1;
            
            // Then by quality symbols (🔥 > ⭐ > ✅ > 📺 > 🎬)
            const qualityOrder = { '🔥': 5, '⭐': 4, '✅': 3, '📺': 2, '🎬': 1 };
            const aQuality = qualityOrder[a.name.split('|')[1]?.trim()] || 0;
            const bQuality = qualityOrder[b.name.split('|')[1]?.trim()] || 0;
            if (aQuality !== bQuality) return bQuality - aQuality;
            
            // Finally by seeders
            const aSeeds = parseInt(a.name.match(/👥 (\d+)/)?.[1]) || 0;
            const bSeeds = parseInt(b.name.match(/👥 (\d+)/)?.[1]) || 0;
            return bSeeds - aSeeds;
        });
        
        const cachedCount = streams.filter(s => s.name.includes('⚡')).length;
        const totalTime = Date.now() - startTime;
        
        console.log(`🎉 Successfully processed ${streams.length} streams in ${totalTime}ms`);
        console.log(`⚡ ${cachedCount} cached streams available for instant playback`);
        
        return { 
            streams,
            _debug: {
                originalQuery: searchQuery,
                totalResults: results.length,
                filteredResults: filteredResults.length,
                finalStreams: streams.length,
                cachedStreams: cachedCount,
                processingTimeMs: totalTime,
                tmdbData: mediaDetails
            }
        };
        
    } catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`❌ Error in handleStream after ${totalTime}ms:`, error);
        
        return { 
            streams: [],
            _debug: {
                error: error.message,
                processingTimeMs: totalTime,
                step: 'handleStream'
            }
        };
    }
}

// ✅ TMDB helper functions (keeping existing but adding better error handling)
async function getTMDBDetails(tmdbId, type = 'movie') {
    try {
        const response = await fetch(`${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`);
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('TMDB fetch error:', error);
        return null;
    }
}

async function getTVShowDetails(tmdbId, seasonNum, episodeNum) {
    try {
        const showResponse = await fetch(
            `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`
        );
        if (!showResponse.ok) throw new Error(`TMDB API error: ${showResponse.status}`);
        const showData = await showResponse.json();

        const episodeResponse = await fetch(
            `${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNum}/episode/${episodeNum}?api_key=${TMDB_API_KEY}`
        );
        if (!episodeResponse.ok) throw new Error(`TMDB API error: ${episodeResponse.status}`);
        const episodeData = await episodeResponse.json();

        return {
            showTitle: showData.name,
            episodeTitle: episodeData.name,
            seasonNumber: seasonNum,
            episodeNumber: episodeNum,
            airDate: episodeData.air_date,
            imdbId: showData.external_ids?.imdb_id
        };
    } catch (error) {
        console.error('TMDB fetch error:', error);
        return null;
    }
}

// ✅ Enhanced search endpoint for testing
async function handleSearch({ query, type }) {
    if (!query) throw new Error('Missing required parameter: query');
    if (!['movie', 'series'].includes(type)) throw new Error('Invalid type. Must be either "movie" or "series"');

    console.log(`🔍 Handling search: "${query}" (${type})`);
    
    try {
        const results = await fetchUIndexData(query, type);
        
        return {
            query: query,
            type: type,
            totalResults: results.length,
            results: results.slice(0, 50).map(result => ({
                title: result.title,
                filename: result.filename,
                quality: result.quality,
                size: result.size,
                seeders: result.seeders,
                leechers: result.leechers,
                magnetLink: result.magnetLink,
                infoHash: result.infoHash,
                source: result.source
            }))
        };
    } catch (error) {
        console.error(`❌ Error in handleSearch:`, error);
        throw error;
    }
}

// ✅ Main Cloudflare Worker handler with enhanced logging
export default {
    async fetch(request, env, ctx) {
        const startTime = Date.now();
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        console.log(`🌐 ${request.method} ${url.pathname} - ${request.headers.get('user-agent')?.substring(0, 50) || 'Unknown'}`);

        try {
            // Stremio manifest
            if (url.pathname === '/manifest.json') {
                const manifest = {
                    id: 'org.uindex.hypremiumize.optimized',
                    version: '2.0.0',
                    name: 'HY UIndex + Premiumize (Optimized)',
                    description: 'Enhanced UIndex torrents with Premiumize streaming - More results, better matching',
                    resources: ['stream'],
                    types: ['movie', 'series'],
                    idPrefixes: ['tt'],
                    catalogs: [],
                    behaviorHints: {
                        adult: false,
                        p2p: true,
                        configurable: false
                    }
                };

                return new Response(JSON.stringify(manifest, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // Stream endpoint (main functionality)
            if (url.pathname.startsWith('/stream/')) {
                const pathParts = url.pathname.split('/');
                const type = pathParts[2];
                let id = pathParts[3];

                if (id.endsWith('.json')) {
                    id = id.slice(0, -5);
                }

                if (!type || !id) {
                    return new Response(JSON.stringify({ 
                        streams: [],
                        error: 'Invalid stream path' 
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                const result = await handleStream(type, id, env);
                const responseTime = Date.now() - startTime;
                
                console.log(`✅ Stream request completed in ${responseTime}ms`);
                
                return new Response(JSON.stringify(result), {
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Response-Time': `${responseTime}ms`,
                        'X-Results-Count': result.streams?.length || 0,
                        ...corsHeaders 
                    }
                });
            }

            // Enhanced health check
            if (url.pathname === '/health') {
                const health = {
                    status: 'OK',
                    addon: 'UIndex + Premiumize (Optimized)',
                    version: '2.0.0',
                    uptime: Date.now(),
                    cache: {
                        entries: cache.size,
                        maxEntries: MAX_CACHE_ENTRIES,
                        ttl: `${CACHE_TTL / 60000} minutes`
                    },
                    features: [
                        'Multi-strategy search',
                        'Enhanced HTML parsing',
                        'Better quality detection',
                        'Improved caching',
                        'Exact matching filters',
                        'Premiumize integration'
                    ]
                };

                return new Response(JSON.stringify(health, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // Enhanced search endpoint for testing
            if (url.pathname === '/search') {
                const searchParams = new URLSearchParams(url.search);
                const query = searchParams.get('q');
                const type = searchParams.get('type') || 'movie';

                if (!query) {
                    return new Response(JSON.stringify({ 
                        error: 'Missing query parameter (q)' 
                    }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }

                const result = await handleSearch({ query, type });
                const responseTime = Date.now() - startTime;
                
                return new Response(JSON.stringify({
                    ...result,
                    responseTimeMs: responseTime
                }, null, 2), {
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Response-Time': `${responseTime}ms`,
                        ...corsHeaders 
                    }
                });
            }

            // Debug endpoint
            if (url.pathname === '/debug') {
                const debug = {
                    worker: 'UIndex + Premiumize Optimized',
                    version: '2.0.0',
                    timestamp: new Date().toISOString(),
                    cache: {
                        size: cache.size,
                        keys: Array.from(cache.keys()).slice(0, 10) // Show first 10 cache keys
                    },
                    capabilities: [
                        'Enhanced HTML parsing with DOM-like functionality',
                        'Multi-strategy search (original + simplified + alternative formats)',
                        'Better quality extraction with comprehensive patterns',
                        'Improved size parsing supporting various units',
                        'Enhanced caching with automatic cleanup',
                        'Exact matching for movies and TV shows',
                        'Premiumize cache checking and stream URL generation',
                        'Advanced result sorting by cache status, quality, and popularity'
                    ]
                };

                return new Response(JSON.stringify(debug, null, 2), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            // 404 for unknown paths
            return new Response(JSON.stringify({ 
                error: 'Not Found',
                availableEndpoints: [
                    '/manifest.json',
                    '/stream/{type}/{id}',
                    '/search?q={query}&type={movie|series}',
                    '/health',
                    '/debug'
                ]
            }), { 
                status: 404, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });

        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error(`❌ Worker error after ${responseTime}ms:`, error);
            
            return new Response(JSON.stringify({ 
                error: 'Internal Server Error',
                message: error.message,
                path: url.pathname,
                responseTimeMs: responseTime
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
    }
};
