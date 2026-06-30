(function() {
    'use strict';

    if (window.youtube_plugin_loaded) return;
    window.youtube_plugin_loaded = true;

    var Manifest = {
        name: 'YouTube',
        version: '1.0.0',
        description: 'YouTube client for Lampa'
    };

    var Config = {
        piped_instances: [
            'https://pipedapi.kavin.rocks',
            'https://pipedapi.adminforge.de',
            'https://pipedapi.syncpundit.io'
        ],
        invidious_instances: [
            'https://inv.nadeko.net',
            'https://invidious.fdn.fr',
            'https://vid.puffyan.us'
        ],
        cache_ttl: 1000 * 60 * 15,
        max_retries: 3,
        request_timeout: 15000,
        quality_order: ['2160', '1440', '1080', '720', '480', '360']
    };

    var Storage = {
        get: function(key, def) {
            try {
                var v = localStorage.getItem('youtube_' + key);
                return v ? JSON.parse(v) : def;
            } catch (e) { return def; }
        },
        set: function(key, val) {
            try { localStorage.setItem('youtube_' + key, JSON.stringify(val)); } catch (e) {}
        },
        remove: function(key) {
            try { localStorage.removeItem('youtube_' + key); } catch (e) {}
        }
    };

    var Cache = {
        get: function(key) {
            var data = Storage.get('cache_' + key, null);
            if (!data) return null;
            if (Date.now() - data.time > Config.cache_ttl) return null;
            return data.value;
        },
        set: function(key, value) {
            Storage.set('cache_' + key, { time: Date.now(), value: value });
        },
        clear: function() {
            Object.keys(localStorage).forEach(function(k) {
                if (k.indexOf('youtube_cache_') === 0) localStorage.removeItem(k);
            });
        }
    };

    var ApiClient = {
        backend: 'auto',
        piped_index: 0,
        invidious_index: 0,

        init: function() {
            this.backend = Storage.get('backend', 'auto');
            this.piped_index = Storage.get('piped_index', 0);
            this.invidious_index = Storage.get('invidious_index', 0);
        },

        request: function(url, options) {
            var self = this;
            options = options || {};
            var retries = 0;
            var max_retries = options.retries || Config.max_retries;

            return new Promise(function(resolve, reject) {
                function attempt() {
                    var controller = new AbortController();
                    var timeoutId = setTimeout(function() { controller.abort(); }, Config.request_timeout);

                    fetch(url, {
                        method: 'GET',
                        headers: options.headers || {},
                        signal: controller.signal
                    }).then(function(response) {
                        clearTimeout(timeoutId);
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.json();
                    }).then(function(data) {
                        resolve(data);
                    }).catch(function(err) {
                        clearTimeout(timeoutId);
                        retries++;
                        if (retries < max_retries) {
                            setTimeout(attempt, 500 * retries);
                        } else {
                            reject(err);
                        }
                    });
                }
                attempt();
            });
        },

        getBackendUrl: function(type) {
            if (type === 'piped') {
                return Config.piped_instances[this.piped_index % Config.piped_instances.length];
            }
            return Config.invidious_instances[this.invidious_index % Config.invidious_instances.length];
        },

        switchInstance: function(type) {
            if (type === 'piped') {
                this.piped_index = (this.piped_index + 1) % Config.piped_instances.length;
                Storage.set('piped_index', this.piped_index);
            } else {
                this.invidious_index = (this.invidious_index + 1) % Config.invidious_instances.length;
                Storage.set('invidious_index', this.invidious_index);
            }
        },

        call: function(endpoint, params) {
            var self = this;
            params = params || {};

            var backends = [];
            if (this.backend === 'auto') {
                backends = ['piped', 'invidious'];
            } else {
                backends = [this.backend];
            }

            function tryBackend(index) {
                if (index >= backends.length) {
                    return Promise.reject(new Error('All backends failed'));
                }

                var type = backends[index];
                var baseUrl = self.getBackendUrl(type);
                var url = self.buildUrl(type, endpoint, params, baseUrl);

                return self.request(url).catch(function(err) {
                    self.switchInstance(type);
                    var nextUrl = self.getBackendUrl(type);
                    if (nextUrl !== baseUrl) {
                        url = self.buildUrl(type, endpoint, params, nextUrl);
                        return self.request(url).catch(function() {
                            return tryBackend(index + 1);
                        });
                    }
                    return tryBackend(index + 1);
                });
            }

            return tryBackend(0);
        },

        buildUrl: function(type, endpoint, params, baseUrl) {
            var url = baseUrl;
            if (type === 'piped') {
                url += endpoint;
                var q = [];
                for (var k in params) q.push(k + '=' + encodeURIComponent(params[k]));
                if (q.length) url += '?' + q.join('&');
            } else {
                url += '/api/v1' + endpoint;
                var q = [];
                for (var k in params) q.push(k + '=' + encodeURIComponent(params[k]));
                if (q.length) url += '?' + q.join('&');
            }
            return url;
        },

        trending: function(region) {
            var cacheKey = 'trending_' + (region || 'US');
            var cached = Cache.get(cacheKey);
            if (cached) return Promise.resolve(cached);

            return this.call('/trending', { region: region || 'US' }).then(function(data) {
                var result = Parser.parseList(data, 'trending');
                Cache.set(cacheKey, result);
                return result;
            });
        },

        search: function(query, page) {
            var cacheKey = 'search_' + query + '_' + (page || 1);
            var cached = Cache.get(cacheKey);
            if (cached) return Promise.resolve(cached);

            var params = { q: query };
            if (page && page > 1) params.page = page;

            return this.call('/search', params).then(function(data) {
                var result = Parser.parseList(data, 'search');
                Cache.set(cacheKey, result);
                return result;
            });
        },

        video: function(id) {
            var cacheKey = 'video_' + id;
            var cached = Cache.get(cacheKey);
            if (cached) return Promise.resolve(cached);

            return this.call('/streams/' + id, {}).then(function(data) {
                var result = Parser.parseVideo(data);
                Cache.set(cacheKey, result);
                return result;
            }).catch(function() {
                return this.call('/videos/' + id, {}).then(function(data) {
                    var result = Parser.parseVideoInvidious(data);
                    Cache.set(cacheKey, result);
                    return result;
                });
            }.bind(this));
        },

        channel: function(id) {
            var cacheKey = 'channel_' + id;
            var cached = Cache.get(cacheKey);
            if (cached) return Promise.resolve(cached);

            return this.call('/channel/' + id, {}).then(function(data) {
                var result = Parser.parseChannel(data);
                Cache.set(cacheKey, result);
                return result;
            });
        },

        playlist: function(id) {
            var cacheKey = 'playlist_' + id;
            var cached = Cache.get(cacheKey);
            if (cached) return Promise.resolve(cached);

            return this.call('/playlists/' + id, {}).then(function(data) {
                var result = Parser.parsePlaylist(data);
                Cache.set(cacheKey, result);
                return result;
            });
        }
    };

    var Parser = {
        parseList: function(data, type) {
            var items = [];
            var list = data.items || data.relatedStreams || data || [];
            if (!Array.isArray(list)) list = [];

            list.forEach(function(item) {
                if (!item) return;
                var url = item.url || '';
                var videoId = item.videoId || item.id || '';
                if (!videoId && url) {
                    var m = url.match(/[?&]v=([^&]+)/) || url.match(/\/watch\/([^?&]+)/) || url.match(/\/shorts\/([^?&]+)/);
                    if (m) videoId = m[1];
                }
                if (!videoId) return;

                var channelId = item.uploaderUrl ? item.uploaderUrl.replace('/channel/', '') : (item.authorId || '');
                var thumb = item.thumbnail || item.videoThumbnails && item.videoThumbnails[3] && item.videoThumbnails[3].url || '';
                if (thumb && thumb.indexOf('http') !== 0) thumb = 'https:' + thumb;

                items.push({
                    videoId: videoId,
                    title: item.title || '',
                    channel: item.uploader || item.author || '',
                    channelId: channelId,
                    thumbnail: thumb,
                    views: item.views || 0,
                    duration: item.duration || item.lengthSeconds || 0,
                    uploaded: item.uploadedDate || item.publishedText || '',
                    uploadedTime: item.uploaded || 0,
                    type: item.type || (url.indexOf('shorts') >= 0 ? 'short' : 'video')
                });
            });

            return {
                items: items,
                nextpage: data.nextpage || (data.continuation || null)
            };
        },

        parseVideo: function(data) {
            var streams = [];
            if (data.videoStreams) {
                data.videoStreams.forEach(function(s) {
                    if (s.url) {
                        streams.push({
                            url: s.url,
                            format: s.format || 'MPEG_4',
                            quality: (s.quality || '').replace('p', ''),
                            mime: s.mimeType || '',
                            bitrate: s.bitrate || 0,
                            fps: s.fps || 30
                        });
                    }
                });
            }
            if (data.hls) {
                streams.push({
                    url: data.hls,
                    format: 'HLS',
                    quality: 'auto',
                    mime: 'application/vnd.apple.mpegurl'
                });
            }

            var related = [];
            if (data.relatedStreams) {
                data.relatedStreams.forEach(function(r) {
                    var url = r.url || '';
                    var vid = r.url ? (url.match(/[?&]v=([^&]+)/) || [])[1] : r.videoId;
                    if (!vid) return;
                    related.push({
                        videoId: vid,
                        title: r.title || '',
                        channel: r.uploader || '',
                        thumbnail: r.thumbnail || '',
                        duration: r.duration || 0,
                        views: r.views || 0
                    });
                });
            }

            return {
                id: data.id || '',
                title: data.title || '',
                description: data.description || '',
                channel: data.uploader || '',
                channelId: data.uploaderUrl ? data.uploaderUrl.replace('/channel/', '') : '',
                channelAvatar: data.uploaderAvatar || '',
                views: data.views || 0,
                likes: data.likes || 0,
                dislikes: data.dislikes || 0,
                duration: data.duration || 0,
                published: data.uploadDate || '',
                thumbnail: data.thumbnailUrl || '',
                streams: streams,
                related: related,
                subtitles: data.subtitles || []
            };
        },

        parseVideoInvidious: function(data) {
            var streams = [];
            if (data.formatStreams) {
                data.formatStreams.forEach(function(s) {
                    if (s.url) {
                        streams.push({
                            url: s.url,
                            format: 'MPEG_4',
                            quality: (s.qualityLabel || s.quality || '').replace('p', ''),
                            mime: s.type || '',
                            bitrate: s.bitrate || 0,
                            fps: s.fps || 30
                        });
                    }
                });
            }
            if (data.hlsUrl) {
                streams.push({
                    url: data.hlsUrl,
                    format: 'HLS',
                    quality: 'auto',
                    mime: 'application/vnd.apple.mpegurl'
                });
            }

            var related = [];
            if (data.recommendedVideos) {
                data.recommendedVideos.forEach(function(r) {
                    related.push({
                        videoId: r.videoId,
                        title: r.title || '',
                        channel: r.author || '',
                        thumbnail: r.videoThumbnails && r.videoThumbnails[3] && r.videoThumbnails[3].url || '',
                        duration: r.lengthSeconds || 0,
                        views: r.viewCount || 0
                    });
                });
            }

            return {
                id: data.videoId || '',
                title: data.title || '',
                description: data.description || '',
                channel: data.author || '',
                channelId: data.authorId || '',
                channelAvatar: data.authorThumbnails && data.authorThumbnails[2] && data.authorThumbnails[2].url || '',
                views: data.viewCount || 0,
                likes: data.likeCount || 0,
                dislikes: data.dislikeCount || 0,
                duration: data.lengthSeconds || 0,
                published: data.publishedText || '',
                thumbnail: data.videoThumbnails && data.videoThumbnails[0] && data.videoThumbnails[0].url || '',
                streams: streams,
                related: related,
                subtitles: data.captions || []
            };
        },

        parseChannel: function(data) {
            var videos = [];
            var items = data.relatedStreams || data.latestVideos || [];
            items.forEach(function(item) {
                var url = item.url || '';
                var vid = item.videoId || (url.match(/[?&]v=([^&]+)/) || [])[1];
                if (!vid) return;
                videos.push({
                    videoId: vid,
                    title: item.title || '',
                    thumbnail: item.thumbnail || '',
                    duration: item.duration || 0,
                    views: item.views || 0,
                    uploaded: item.uploadedDate || ''
                });
            });

            return {
                id: data.id || '',
                name: data.name || '',
                avatar: data.avatarUrl || data.authorThumbnails && data.authorThumbnails[2] && data.authorThumbnails[2].url || '',
                banner: data.bannerUrl || '',
                subscribers: data.subscriberCount || 0,
                description: data.description || '',
                videos: videos,
                nextpage: data.nextpage || null
            };
        },

        parsePlaylist: function(data) {
            var videos = [];
            var items = data.relatedStreams || data.videos || [];
            items.forEach(function(item) {
                var url = item.url || '';
                var vid = item.videoId || (url.match(/[?&]v=([^&]+)/) || [])[1];
                if (!vid) return;
                videos.push({
                    videoId: vid,
                    title: item.title || '',
                    thumbnail: item.thumbnail || '',
                    duration: item.duration || 0,
                    channel: item.uploader || '',
                    views: item.views || 0
                });
            });

            return {
                id: data.id || data.playlistId || '',
                title: data.name || data.title || '',
                thumbnail: data.thumbnail || data.thumbnailUrl || '',
                videosCount: data.videosCount || data.videoCount || videos.length,
                videos: videos,
                nextpage: data.nextpage || null
            };
        }
    };

    var Utils = {
        formatViews: function(n) {
            if (!n) return '';
            if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return String(n);
        },
        formatDuration: function(sec) {
            if (!sec) return '';
            sec = parseInt(sec);
            var h = Math.floor(sec / 3600);
            var m = Math.floor((sec % 3600) / 60);
            var s = sec % 60;
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        },
        extractVideoId: function(url) {
            if (!url) return '';
            var m = url.match(/[?&]v=([^&]+)/) || url.match(/\/watch\/([^?&]+)/) || url.match(/\/shorts\/([^?&]+)/);
            return m ? m[1] : '';
        },
        pickStream: function(streams, preferred) {
            if (!streams || !streams.length) return null;
            preferred = preferred || Storage.get('quality', '1080');

            var hls = null;
            var mp4_by_q = {};

            streams.forEach(function(s) {
                if (s.format === 'HLS') hls = s;
                else if (s.quality) mp4_by_q[s.quality] = s;
            });

            if (preferred === 'auto' && hls) return hls;

            var order = Config.quality_order;
            var startIdx = order.indexOf(preferred);
            if (startIdx < 0) startIdx = 2;

            for (var i = startIdx; i < order.length; i++) {
                if (mp4_by_q[order[i]]) return mp4_by_q[order[i]];
            }
            for (var i = startIdx - 1; i >= 0; i--) {
                if (mp4_by_q[order[i]]) return mp4_by_q[order[i]];
            }

            var keys = Object.keys(mp4_by_q);
            if (keys.length) return mp4_by_q[keys[0]];
            return hls;
        }
    };

    var History = {
        key: 'history',
        max: 100,
        getAll: function() { return Storage.get(this.key, []); },
        add: function(item) {
            var list = this.getAll().filter(function(v) { return v.videoId !== item.videoId; });
            list.unshift({
                videoId: item.videoId,
                title: item.title,
                thumbnail: item.thumbnail,
                channel: item.channel,
                duration: item.duration,
                time: Date.now()
            });
            if (list.length > this.max) list = list.slice(0, this.max);
            Storage.set(this.key, list);
        },
        remove: function(id) {
            Storage.set(this.key, this.getAll().filter(function(v) { return v.videoId !== id; }));
        },
        clear: function() { Storage.set(this.key, []); }
    };

    var Favorites = {
        key: 'favorites',
        getAll: function() { return Storage.get(this.key, []); },
        has: function(id) { return this.getAll().some(function(v) { return v.videoId === id; }); },
        toggle: function(item) {
            var list = this.getAll();
            var idx = list.findIndex(function(v) { return v.videoId === item.videoId; });
            if (idx >= 0) {
                list.splice(idx, 1);
            } else {
                list.unshift({
                    videoId: item.videoId,
                    title: item.title,
                    thumbnail: item.thumbnail,
                    channel: item.channel,
                    duration: item.duration,
                    time: Date.now()
                });
            }
            Storage.set(this.key, list);
            return idx < 0;
        },
        clear: function() { Storage.set(this.key, []); }
    };

    var Subscriptions = {
        key: 'subscriptions',
        getAll: function() { return Storage.get(this.key, []); },
        has: function(id) { return this.getAll().some(function(c) { return c.channelId === id; }); },
        toggle: function(channel) {
            var list = this.getAll();
            var idx = list.findIndex(function(c) { return c.channelId === channel.channelId; });
            if (idx >= 0) {
                list.splice(idx, 1);
            } else {
                list.unshift({
                    channelId: channel.channelId,
                    name: channel.name || channel.channel,
                    avatar: channel.avatar || channel.channelAvatar || ''
                });
            }
            Storage.set(this.key, list);
            return idx < 0;
        }
    };

    var UI = {
        createCard: function(item, type) {
            var card = document.createElement('div');
            card.className = 'youtube-card selectbox';
            card.setAttribute('data-video-id', item.videoId || '');
            card.setAttribute('data-channel-id', item.channelId || '');
            card.setAttribute('data-type', type || 'video');

            var poster = document.createElement('div');
            poster.className = 'youtube-card__poster';
            if (item.thumbnail) {
                poster.style.backgroundImage = 'url(' + item.thumbnail + ')';
            }

            var duration = document.createElement('div');
            duration.className = 'youtube-card__duration';
            duration.textContent = Utils.formatDuration(item.duration);
            poster.appendChild(duration);

            var info = document.createElement('div');
            info.className = 'youtube-card__info';

            var title = document.createElement('div');
            title.className = 'youtube-card__title';
            title.textContent = item.title || '';

            var meta = document.createElement('div');
            meta.className = 'youtube-card__meta';
            var parts = [];
            if (item.channel) parts.push(item.channel);
            if (item.views) parts.push(Utils.formatViews(item.views) + ' views');
            if (item.uploaded) parts.push(item.uploaded);
            meta.textContent = parts.join(' • ');

            info.appendChild(title);
            info.appendChild(meta);

            card.appendChild(poster);
            card.appendChild(info);

            return card;
        },

        createGrid: function(items, type) {
            var grid = document.createElement('div');
            grid.className = 'youtube-grid';
            items.forEach(function(item) {
                grid.appendChild(UI.createCard(item, type));
            });
            return grid;
        }
    };

    var Styles = {
        inject: function() {
            if (document.getElementById('youtube-plugin-styles')) return;
            var style = document.createElement('style');
            style.id = 'youtube-plugin-styles';
            style.textContent = [
                '.youtube-section{padding:1.5em}',
                '.youtube-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em}',
                '.youtube-card{background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s}',
                '.youtube-card:focus,.youtube-card.focus{transform:scale(1.05);box-shadow:0 8px 24px rgba(0,0,0,.5);outline:3px solid #fff;z-index:2;position:relative}',
                '.youtube-card__poster{position:relative;padding-top:56.25%;background-size:cover;background-position:center;background-color:#1a1a1a}',
                '.youtube-card__duration{position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em;font-weight:600}',
                '.youtube-card__info{padding:.75em}',
                '.youtube-card__title{font-size:.95em;font-weight:600;color:#fff;line-height:1.3;margin-bottom:.3em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
                '.youtube-card__meta{font-size:.8em;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
                '.youtube-menu{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1em;padding:1.5em}',
                '.youtube-menu-item{background:linear-gradient(135deg,#3a3a3a,#2a2a2a);padding:2em 1em;border-radius:10px;text-align:center;cursor:pointer;transition:all .15s;border:2px solid transparent}',
                '.youtube-menu-item:focus,.youtube-menu-item.focus{border-color:#fff;transform:scale(1.05);background:linear-gradient(135deg,#4a4a4a,#3a3a3a)}',
                '.youtube-menu-item__icon{font-size:2.5em;margin-bottom:.3em}',
                '.youtube-menu-item__label{font-size:1em;color:#fff;font-weight:600}',
                '.youtube-search{padding:1.5em}',
                '.youtube-search__input{width:100%;padding:.8em 1em;background:#2a2a2a;border:2px solid #444;border-radius:8px;color:#fff;font-size:1em;box-sizing:border-box}',
                '.youtube-search__input:focus{outline:none;border-color:#fff}',
                '.youtube-video{padding:1.5em;max-width:1200px;margin:0 auto}',
                '.youtube-video__player{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;margin-bottom:1em}',
                '.youtube-video__title{font-size:1.4em;color:#fff;margin-bottom:.5em}',
                '.youtube-video__meta{color:#aaa;font-size:.9em;margin-bottom:1em}',
                '.youtube-video__actions{display:flex;gap:.5em;margin-bottom:1em;flex-wrap:wrap}',
                '.youtube-video__action{background:#2a2a2a;color:#fff;border:none;padding:.5em 1em;border-radius:6px;cursor:pointer;font-size:.9em}',
                '.youtube-video__action:focus{outline:2px solid #fff}',
                '.youtube-video__description{color:#ccc;font-size:.95em;line-height:1.5;white-space:pre-wrap;max-height:200px;overflow:auto;margin-bottom:1.5em;padding:1em;background:#1a1a1a;border-radius:8px}',
                '.youtube-related__title{color:#fff;font-size:1.1em;margin:1em 0 .5em}',
                '.youtube-empty{text-align:center;padding:3em;color:#888;font-size:1.1em}',
                '.youtube-loading{text-align:center;padding:3em;color:#aaa}'
            ].join('\n');
            document.head.appendChild(style);
        }
    };

    var Menu = {
        open: function() {
            var activity = {
                slug: 'youtube',
                title: 'YouTube',
                component: 'youtube_main'
            };
            Lampa.Activity.push(activity);
        },

        render: function() {
            var items = [
                { icon: '🔥', label: 'Trending', action: 'trending' },
                { icon: '📈', label: 'Popular', action: 'popular' },
                { icon: '🎬', label: 'Shorts', action: 'shorts' },
                { icon: '🔍', label: 'Search', action: 'search' },
                { icon: '📺', label: 'Channels', action: 'channels' },
                { icon: '📁', label: 'Playlists', action: 'playlists' },
                { icon: '🔔', label: 'Subscriptions', action: 'subscriptions' },
                { icon: '🕐', label: 'History', action: 'history' },
                { icon: '❤️', label: 'Favorites', action: 'favorites' },
                { icon: '⚙️', label: 'Settings', action: 'settings' }
            ];

            var html = '<div class="youtube-menu">';
            items.forEach(function(it, i) {
                html += '<div class="youtube-menu-item selectbox" data-action="' + it.action + '" tabindex="' + i + '">';
                html += '<div class="youtube-menu-item__icon">' + it.icon + '</div>';
                html += '<div class="youtube-menu-item__label">' + it.label + '</div>';
                html += '</div>';
            });
            html += '</div>';
            return html;
        },

        handleAction: function(action) {
            switch (action) {
                case 'trending': Pages.openTrending(); break;
                case 'popular': Pages.openPopular(); break;
                case 'shorts': Pages.openShorts(); break;
                case 'search': Pages.openSearch(); break;
                case 'channels': Pages.openChannels(); break;
                case 'playlists': Pages.openPlaylists(); break;
                case 'subscriptions': Pages.openSubscriptions(); break;
                case 'history': Pages.openHistory(); break;
                case 'favorites': Pages.openFavorites(); break;
                case 'settings': Settings.open(); break;
            }
        }
    };

    var Pages = {
        current_activity: null,
        scroll_position: {},

        pushActivity: function(component, data) {
            data = data || {};
            var activity = {
                slug: 'youtube_' + component + '_' + Date.now(),
                title: data.title || 'YouTube',
                component: component
            };
            if (data) activity.data = data;
            Lampa.Activity.push(activity);
        },

        openTrending: function() {
            this.pushActivity('youtube_trending', { title: 'YouTube Trending' });
        },

        openPopular: function() {
            this.pushActivity('youtube_popular', { title: 'YouTube Popular' });
        },

        openShorts: function() {
            this.pushActivity('youtube_shorts', { title: 'YouTube Shorts' });
        },

        openSearch: function() {
            this.pushActivity('youtube_search', { title: 'YouTube Search' });
        },

        openChannels: function() {
            this.pushActivity('youtube_channels', { title: 'YouTube Channels' });
        },

        openPlaylists: function() {
            this.pushActivity('youtube_playlists', { title: 'YouTube Playlists' });
        },

        openSubscriptions: function() {
            this.pushActivity('youtube_subscriptions', { title: 'Subscriptions' });
        },

        openHistory: function() {
            this.pushActivity('youtube_history', { title: 'History' });
        },

        openFavorites: function() {
            this.pushActivity('youtube_favorites', { title: 'Favorites' });
        },

        openVideo: function(videoId) {
            this.pushActivity('youtube_video', { title: 'Video', videoId: videoId });
        },

        openChannel: function(channelId, title) {
            this.pushActivity('youtube_channel', { title: title || 'Channel', channelId: channelId });
        },

        openPlaylist: function(playlistId, title) {
            this.pushActivity('youtube_playlist', { title: title || 'Playlist', playlistId: playlistId });
        }
    };

    var Components = {
        main: function(activity, body) {
            body.innerHTML = '<div class="youtube-section">' + Menu.render() + '</div>';
            var items = body.querySelectorAll('.youtube-menu-item');
            items.forEach(function(el) {
                el.addEventListener('enter', function() {
                    Menu.handleAction(el.getAttribute('data-action'));
                });
            });
            if (items[0]) {
                setTimeout(function() {
                    if (Lampa.Controller) Lampa.Controller.toggle('content');
                }, 100);
            }
        },

        listPage: function(activity, body, loader, title) {
            body.innerHTML = '<div class="youtube-section"><div class="youtube-loading">Loading...</div></div>';
            loader().then(function(result) {
                var section = body.querySelector('.youtube-section');
                if (!result.items || !result.items.length) {
                    section.innerHTML = '<div class="youtube-empty">No items found</div>';
                    return;
                }
                section.innerHTML = '';
                var h = document.createElement('h2');
                h.style.color = '#fff';
                h.style.margin = '0 0 1em';
                h.textContent = title;
                section.appendChild(h);
                section.appendChild(UI.createGrid(result.items, 'video'));
                Components.bindCardEvents(body);
            }).catch(function(err) {
                var section = body.querySelector('.youtube-section');
                section.innerHTML = '<div class="youtube-empty">Failed to load: ' + (err.message || err) + '</div>';
            });
        },

        trending: function(activity, body) {
            Components.listPage(activity, body, function() {
                return ApiClient.trending(Storage.get('region', 'US'));
            }, 'Trending');
        },

        popular: function(activity, body) {
            Components.listPage(activity, body, function() {
                return ApiClient.trending(Storage.get('region', 'US')).then(function(r) {
                    r.items = r.items.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
                    return r;
                });
            }, 'Popular');
        },

        shorts: function(activity, body) {
            Components.listPage(activity, body, function() {
                return ApiClient.search('shorts', 1).then(function(r) {
                    r.items = r.items.filter(function(i) { return i.type === 'short' || (i.duration && i.duration < 60); });
                    return r;
                });
            }, 'Shorts');
        },

        search: function(activity, body) {
            body.innerHTML = '<div class="youtube-section youtube-search">' +
                '<input type="text" class="youtube-search__input" placeholder="Search YouTube..." autofocus>' +
                '<div class="youtube-search__results"></div>' +
                '</div>';

            var input = body.querySelector('.youtube-search__input');
            var results = body.querySelector('.youtube-search__results');
            var timer = null;

            input.addEventListener('input', function() {
                clearTimeout(timer);
                timer = setTimeout(function() {
                    var q = input.value.trim();
                    if (!q) {
                        results.innerHTML = '';
                        return;
                    }
                    results.innerHTML = '<div class="youtube-loading">Searching...</div>';
                    ApiClient.search(q, 1).then(function(data) {
                        if (!data.items.length) {
                            results.innerHTML = '<div class="youtube-empty">Nothing found</div>';
                            return;
                        }
                        results.innerHTML = '';
                        results.appendChild(UI.createGrid(data.items, 'video'));
                        Components.bindCardEvents(body);
                    }).catch(function() {
                        results.innerHTML = '<div class="youtube-empty">Search failed</div>';
                    });
                }, 400);
            });

            setTimeout(function() { input.focus(); }, 100);
        },

        channels: function(activity, body) {
            body.innerHTML = '<div class="youtube-section youtube-search">' +
                '<input type="text" class="youtube-search__input" placeholder="Search channels...">' +
                '<div class="youtube-search__results"></div>' +
                '</div>';
            var input = body.querySelector('.youtube-search__input');
            var results = body.querySelector('.youtube-search__results');
            var timer = null;
            input.addEventListener('input', function() {
                clearTimeout(timer);
                timer = setTimeout(function() {
                    var q = input.value.trim();
                    if (!q) { results.innerHTML = ''; return; }
                    results.innerHTML = '<div class="youtube-loading">Searching...</div>';
                    ApiClient.call('/search', { q: q, filter: 'channels' }).then(function(data) {
                        var parsed = Parser.parseList(data, 'channels');
                        if (!parsed.items.length) {
                            results.innerHTML = '<div class="youtube-empty">No channels found</div>';
                            return;
                        }
                        results.innerHTML = '';
                        var grid = document.createElement('div');
                        grid.className = 'youtube-grid';
                        parsed.items.forEach(function(ch) {
                            var card = document.createElement('div');
                            card.className = 'youtube-card selectbox';
                            card.setAttribute('data-channel-id', ch.channelId);
                            card.innerHTML = '<div class="youtube-card__poster" style="background-image:url(' + (ch.thumbnail || '') + ')"></div>' +
                                '<div class="youtube-card__info"><div class="youtube-card__title">' + (ch.title || ch.channel || '') + '</div></div>';
                            card.addEventListener('enter', function() {
                                Pages.openChannel(ch.channelId, ch.title || ch.channel);
                            });
                            grid.appendChild(card);
                        });
                        results.appendChild(grid);
                    }).catch(function() {
                        results.innerHTML = '<div class="youtube-empty">Search failed</div>';
                    });
                }, 400);
            });
        },

        playlists: function(activity, body) {
            body.innerHTML = '<div class="youtube-section youtube-search">' +
                '<input type="text" class="youtube-search__input" placeholder="Search playlists...">' +
                '<div class="youtube-search__results"></div>' +
                '</div>';
            var input = body.querySelector('.youtube-search__input');
            var results = body.querySelector('.youtube-search__results');
            var timer = null;
            input.addEventListener('input', function() {
                clearTimeout(timer);
                timer = setTimeout(function() {
                    var q = input.value.trim();
                    if (!q) { results.innerHTML = ''; return; }
                    results.innerHTML = '<div class="youtube-loading">Searching...</div>';
                    ApiClient.call('/search', { q: q, filter: 'playlists' }).then(function(data) {
                        var parsed = Parser.parseList(data, 'playlists');
                        if (!parsed.items.length) {
                            results.innerHTML = '<div class="youtube-empty">No playlists found</div>';
                            return;
                        }
                        results.innerHTML = '';
                        var grid = document.createElement('div');
                        grid.className = 'youtube-grid';
                        parsed.items.forEach(function(pl) {
                            var card = document.createElement('div');
                            card.className = 'youtube-card selectbox';
                            card.setAttribute('data-playlist-id', pl.videoId || pl.id);
                            card.innerHTML = '<div class="youtube-card__poster" style="background-image:url(' + (pl.thumbnail || '') + ')"></div>' +
                                '<div class="youtube-card__info"><div class="youtube-card__title">' + (pl.title || '') + '</div></div>';
                            card.addEventListener('enter', function() {
                                Pages.openPlaylist(pl.videoId || pl.id, pl.title);
                            });
                            grid.appendChild(card);
                        });
                        results.appendChild(grid);
                    }).catch(function() {
                        results.innerHTML = '<div class="youtube-empty">Search failed</div>';
                    });
                }, 400);
            });
        },

        subscriptions: function(activity, body) {
            var subs = Subscriptions.getAll();
            if (!subs.length) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">No subscriptions yet. Subscribe to channels to see them here.</div></div>';
                return;
            }
            body.innerHTML = '<div class="youtube-section"><h2 style="color:#fff">Subscriptions</h2><div class="youtube-grid"></div></div>';
            var grid = body.querySelector('.youtube-grid');
            subs.forEach(function(ch) {
                var card = document.createElement('div');
                card.className = 'youtube-card selectbox';
                card.innerHTML = '<div class="youtube-card__poster" style="background-image:url(' + (ch.avatar || '') + ')"></div>' +
                    '<div class="youtube-card__info"><div class="youtube-card__title">' + (ch.name || '') + '</div></div>';
                card.addEventListener('enter', function() {
                    Pages.openChannel(ch.channelId, ch.name);
                });
                grid.appendChild(card);
            });
        },

        history: function(activity, body) {
            var items = History.getAll();
            if (!items.length) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">History is empty</div></div>';
                return;
            }
            body.innerHTML = '<div class="youtube-section"><h2 style="color:#fff">History</h2><div class="youtube-grid"></div></div>';
            var grid = body.querySelector('.youtube-grid');
            items.forEach(function(item) {
                grid.appendChild(UI.createCard(item, 'video'));
            });
            Components.bindCardEvents(body);
        },

        favorites: function(activity, body) {
            var items = Favorites.getAll();
            if (!items.length) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">Favorites is empty</div></div>';
                return;
            }
            body.innerHTML = '<div class="youtube-section"><h2 style="color:#fff">Favorites</h2><div class="youtube-grid"></div></div>';
            var grid = body.querySelector('.youtube-grid');
            items.forEach(function(item) {
                grid.appendChild(UI.createCard(item, 'video'));
            });
            Components.bindCardEvents(body);
        },

        video: function(activity, body) {
            var videoId = activity.data && activity.data.videoId;
            if (!videoId) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">No video id</div></div>';
                return;
            }

            body.innerHTML = '<div class="youtube-section youtube-video"><div class="youtube-loading">Loading video...</div></div>';

            ApiClient.video(videoId).then(function(video) {
                History.add({
                    videoId: video.id,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    channel: video.channel,
                    duration: video.duration
                });

                var stream = Utils.pickStream(video.streams);
                var container = body.querySelector('.youtube-video');
                if (!container) return;

                var html = '<div class="youtube-video__player" id="youtube-player"></div>' +
                    '<h1 class="youtube-video__title">' + (video.title || '') + '</h1>' +
                    '<div class="youtube-video__meta">' +
                    '<span>' + (video.channel || '') + '</span>' +
                    (video.views ? ' • <span>' + Utils.formatViews(video.views) + ' views</span>' : '') +
                    (video.published ? ' • <span>' + video.published + '</span>' : '') +
                    '</div>' +
                    '<div class="youtube-video__actions">' +
                    '<button class="youtube-video__action" data-act="fav">' + (Favorites.has(video.id) ? '❤️ Favorited' : '❤️ Favorite') + '</button>' +
                    '<button class="youtube-video__action" data-act="sub">' + (Subscriptions.has(video.channelId) ? '🔔 Subscribed' : '🔔 Subscribe') + '</button>' +
                    '<button class="youtube-video__action" data-act="channel">📺 Channel</button>' +
                    '<button class="youtube-video__action" data-act="share">🔗 Share</button>' +
                    '</div>' +
                    (video.description ? '<div class="youtube-video__description">' + (video.description || '').replace(/</g, '&lt;') + '</div>' : '');

                container.innerHTML = html;

                if (stream) {
                    Player.start(stream, video);
                } else {
                    container.querySelector('.youtube-video__player').innerHTML = '<div style="color:#f66;padding:2em;text-align:center">No playable streams found</div>';
                }

                container.querySelector('[data-act="fav"]').addEventListener('click', function() {
                    var added = Favorites.toggle({
                        videoId: video.id,
                        title: video.title,
                        thumbnail: video.thumbnail,
                        channel: video.channel,
                        duration: video.duration
                    });
                    this.textContent = added ? '❤️ Favorited' : '❤️ Favorite';
                });

                container.querySelector('[data-act="sub"]').addEventListener('click', function() {
                    var added = Subscriptions.toggle({
                        channelId: video.channelId,
                        name: video.channel,
                        avatar: video.channelAvatar
                    });
                    this.textContent = added ? '🔔 Subscribed' : '🔔 Subscribe';
                });

                container.querySelector('[data-act="channel"]').addEventListener('click', function() {
                    if (video.channelId) Pages.openChannel(video.channelId, video.channel);
                });

                container.querySelector('[data-act="share"]').addEventListener('click', function() {
                    try {
                        var url = 'https://www.youtube.com/watch?v=' + video.id;
                        if (navigator.clipboard) navigator.clipboard.writeText(url);
                    } catch (e) {}
                });

                if (video.related && video.related.length) {
                    var rel = document.createElement('div');
                    rel.className = 'youtube-related';
                    rel.innerHTML = '<div class="youtube-related__title">Related Videos</div>';
                    rel.appendChild(UI.createGrid(video.related, 'video'));
                    container.appendChild(rel);
                    Components.bindCardEvents(container);
                }
            }).catch(function(err) {
                var container = body.querySelector('.youtube-video');
                if (container) container.innerHTML = '<div class="youtube-empty">Failed to load video: ' + (err.message || err) + '</div>';
            });
        },

        channel: function(activity, body) {
            var channelId = activity.data && activity.data.channelId;
            if (!channelId) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">No channel id</div></div>';
                return;
            }
            body.innerHTML = '<div class="youtube-section"><div class="youtube-loading">Loading channel...</div></div>';
            ApiClient.channel(channelId).then(function(ch) {
                var section = body.querySelector('.youtube-section');
                var html = '<div style="display:flex;gap:1em;align-items:center;margin-bottom:1.5em">' +
                    (ch.avatar ? '<img src="' + ch.avatar + '" style="width:80px;height:80px;border-radius:50%">' : '') +
                    '<div><h2 style="color:#fff;margin:0">' + (ch.name || '') + '</h2>' +
                    (ch.subscribers ? '<div style="color:#aaa">' + Utils.formatViews(ch.subscribers) + ' subscribers</div>' : '') +
                    '</div></div>' +
                    '<div class="youtube-grid"></div>';
                section.innerHTML = html;
                var grid = section.querySelector('.youtube-grid');
                (ch.videos || []).forEach(function(v) {
                    grid.appendChild(UI.createCard(v, 'video'));
                });
                Components.bindCardEvents(body);
            }).catch(function(err) {
                body.querySelector('.youtube-section').innerHTML = '<div class="youtube-empty">Failed to load channel: ' + (err.message || err) + '</div>';
            });
        },

        playlist: function(activity, body) {
            var playlistId = activity.data && activity.data.playlistId;
            if (!playlistId) {
                body.innerHTML = '<div class="youtube-section"><div class="youtube-empty">No playlist id</div></div>';
                return;
            }
            body.innerHTML = '<div class="youtube-section"><div class="youtube-loading">Loading playlist...</div></div>';
            ApiClient.playlist(playlistId).then(function(pl) {
                var section = body.querySelector('.youtube-section');
                var html = '<h2 style="color:#fff">' + (pl.title || '') + '</h2>' +
                    '<div style="color:#aaa;margin-bottom:1em">' + (pl.videosCount || 0) + ' videos</div>' +
                    '<div class="youtube-grid"></div>';
                section.innerHTML = html;
                var grid = section.querySelector('.youtube-grid');
                (pl.videos || []).forEach(function(v) {
                    grid.appendChild(UI.createCard(v, 'video'));
                });
                Components.bindCardEvents(body);
            }).catch(function(err) {
                body.querySelector('.youtube-section').innerHTML = '<div class="youtube-empty">Failed to load playlist: ' + (err.message || err) + '</div>';
            });
        },

        bindCardEvents: function(root) {
            var cards = root.querySelectorAll('.youtube-card');
            cards.forEach(function(card) {
                card.addEventListener('enter', function() {
                    var videoId = card.getAttribute('data-video-id');
                    var channelId = card.getAttribute('data-channel-id');
                    var playlistId = card.getAttribute('data-playlist-id');
                    var type = card.getAttribute('data-type');
                    if (videoId) Pages.openVideo(videoId);
                    else if (channelId) Pages.openChannel(channelId);
                    else if (playlistId) Pages.openPlaylist(playlistId);
                });
            });
        }
    };

    var Player = {
        current: null,
        start: function(stream, video) {
            this.current = { stream: stream, video: video };
            Storage.set('last_watched', { videoId: video.id, time: Date.now() });

            if (stream.format === 'HLS') {
                this.playHLS(stream.url, video);
            } else {
                this.playDirect(stream.url, video);
            }
        },

        playDirect: function(url, video) {
            var playerObj = {
                url: url,
                title: video.title,
                poster: video.thumbnail,
                subtitles: (video.subtitles || []).map(function(s) {
                    return { label: s.name || s.code || 'Sub', url: s.url };
                })
            };
            if (Lampa.Player) {
                Lampa.Player.play(playerObj);
            } else {
                this.fallbackPlayer(playerObj);
            }
        },

        playHLS: function(url, video) {
            var playerObj = {
                url: url,
                title: video.title,
                poster: video.thumbnail,
                type: 'hls',
                subtitles: (video.subtitles || []).map(function(s) {
                    return { label: s.name || s.code || 'Sub', url: s.url };
                })
            };
            if (Lampa.Player) {
                Lampa.Player.play(playerObj);
            } else {
                this.fallbackPlayer(playerObj);
            }
        },

        fallbackPlayer: function(obj) {
            var container = document.getElementById('youtube-player');
            if (!container) return;
            container.innerHTML = '';
            var video = document.createElement('video');
            video.src = obj.url;
            video.controls = true;
            video.autoplay = true;
            video.style.width = '100%';
            video.style.height = '100%';
            if (obj.poster) video.poster = obj.poster;
            container.appendChild(video);
        }
    };

    var Settings = {
        open: function() {
            var settings = [
                {
                    name: 'Backend',
                    key: 'backend',
                    type: 'select',
                    values: ['auto', 'piped', 'invidious'],
                    default: 'auto'
                },
                {
                    name: 'Region',
                    key: 'region',
                    type: 'select',
                    values: ['US', 'GB', 'DE', 'FR', 'RU', 'UA', 'PL', 'JP', 'KR', 'BR'],
                    default: 'US'
                },
                {
                    name: 'Default Quality',
                    key: 'quality',
                    type: 'select',
                    values: ['auto', '2160', '1440', '1080', '720', '480', '360'],
                    default: '1080'
                },
                {
                    name: 'Cache TTL (minutes)',
                    key: 'cache_ttl_min',
                    type: 'select',
                    values: ['5', '15', '30', '60', '120'],
                    default: '15'
                },
                {
                    name: 'Clear Cache',
                    key: 'clear_cache',
                    type: 'button'
                },
                {
                    name: 'Clear History',
                    key: 'clear_history',
                    type: 'button'
                },
                {
                    name: 'Clear Favorites',
                    key: 'clear_favorites',
                    type: 'button'
                }
            ];

            if (Lampa.Settings) {
                var params = {
                    title: 'YouTube Settings',
                    items: []
                };

                settings.forEach(function(s) {
                    if (s.type === 'select') {
                        params.items.push({
                            label: s.name,
                            value: Storage.get(s.key, s.default),
                            values: s.values.reduce(function(a, v) { a[v] = v; return a; }, {}),
                            onSelect: function(val) {
                                Storage.set(s.key, val);
                                if (s.key === 'cache_ttl_min') {
                                    Config.cache_ttl = parseInt(val) * 60 * 1000;
                                }
                            }
                        });
                    } else if (s.type === 'button') {
                        params.items.push({
                            label: s.name,
                            onSelect: function() {
                                if (s.key === 'clear_cache') Cache.clear();
                                else if (s.key === 'clear_history') History.clear();
                                else if (s.key === 'clear_favorites') Favorites.clear();
                                if (Lampa.Toast) Lampa.Toast.show('Cleared', 2000);
                            }
                        });
                    }
                });

                Lampa.Settings.open(params);
            } else {
                this.openFallback(settings);
            }
        },

        openFallback: function(settings) {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);z-index:1000;display:flex;align-items:center;justify-content:center;padding:2em';
            var box = document.createElement('div');
            box.style.cssText = 'background:#1a1a1a;padding:2em;border-radius:12px;max-width:500px;width:100%;max-height:80vh;overflow:auto';
            box.innerHTML = '<h2 style="color:#fff;margin-top:0">YouTube Settings</h2>';

            settings.forEach(function(s) {
                var row = document.createElement('div');
                row.style.cssText = 'margin-bottom:1em;color:#fff';
                if (s.type === 'select') {
                    var current = Storage.get(s.key, s.default);
                    row.innerHTML = '<label style="display:block;margin-bottom:.3em">' + s.name + '</label>' +
                        '<select class="selectbox" style="width:100%;padding:.5em;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px"></select>';
                    var sel = row.querySelector('select');
                    s.values.forEach(function(v) {
                        var opt = document.createElement('option');
                        opt.value = v;
                        opt.textContent = v;
                        if (v === current) opt.selected = true;
                        sel.appendChild(opt);
                    });
                    sel.addEventListener('change', function() {
                        Storage.set(s.key, sel.value);
                        if (s.key === 'cache_ttl_min') Config.cache_ttl = parseInt(sel.value) * 60 * 1000;
                    });
                } else {
                    row.innerHTML = '<button class="selectbox" style="width:100%;padding:.6em;background:#2a2a2a;color:#fff;border:1px solid #444;border-radius:4px;cursor:pointer">' + s.name + '</button>';
                    row.querySelector('button').addEventListener('click', function() {
                        if (s.key === 'clear_cache') Cache.clear();
                        else if (s.key === 'clear_history') History.clear();
                        else if (s.key === 'clear_favorites') Favorites.clear();
                        row.querySelector('button').textContent = 'Cleared!';
                        setTimeout(function() { row.querySelector('button').textContent = s.name; }, 1500);
                    });
                }
                box.appendChild(row);
            });

            var closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.cssText = 'width:100%;padding:.7em;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:1em';
            closeBtn.addEventListener('click', function() { overlay.remove(); });
            box.appendChild(closeBtn);

            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
            overlay.appendChild(box);
            document.body.appendChild(overlay);
        }
    };

    var Router = {
        register: function() {
            var components = {
                'youtube_main': Components.main,
                'youtube_trending': Components.trending,
                'youtube_popular': Components.popular,
                'youtube_shorts': Components.shorts,
                'youtube_search': Components.search,
                'youtube_channels': Components.channels,
                'youtube_playlists': Components.playlists,
                'youtube_subscriptions': Components.subscriptions,
                'youtube_history': Components.history,
                'youtube_favorites': Components.favorites,
                'youtube_video': Components.video,
                'youtube_channel': Components.channel,
                'youtube_playlist': Components.playlist
            };

            if (Lampa.Component) {
                Object.keys(components).forEach(function(name) {
                    Lampa.Component.register(name, function(activity, body) {
                        components[name](activity, body);
                    });
                });
            }

            if (Lampa.Listener) {
                Lampa.Listener.follow('app', function(e) {
                    if (e.type === 'ready') {
                        Menu.addToSidebar();
                    }
                });
            }
        }
    };

    Menu.addToSidebar = function() {
        if (!Lampa.Activity || !Lampa.Activity.render) return;
        try {
            if (window.Lampa && Lampa.Lang) {
                var add = function() {
                    var menu = document.querySelector('.navigation-bar__body, .sidebar, [class*="menu"]');
                    if (menu && !document.querySelector('[data-youtube-menu]')) {
                        var item = document.createElement('div');
                        item.className = 'selectbox';
                        item.setAttribute('data-youtube-menu', '1');
                        item.style.cssText = 'padding:.8em 1em;cursor:pointer;color:#fff;display:flex;align-items:center;gap:.5em';
                        item.innerHTML = '<span>▶️</span><span>YouTube</span>';
                        item.addEventListener('enter', function() { Menu.open(); });
                        item.addEventListener('click', function() { Menu.open(); });
                        menu.appendChild(item);
                    }
                };
                setTimeout(add, 500);
                setTimeout(add, 2000);
            }
        } catch (e) {}
    };

    var Init = {
        run: function() {
            Styles.inject();
            ApiClient.init();
            Config.cache_ttl = (Storage.get('cache_ttl_min', 15)) * 60 * 1000;
            Router.register();

            if (Lampa.Listener) {
                Lampa.Listener.follow('activity', function(e) {
                    if (e.type === 'start' && e.data && e.data.component === 'youtube_main') {
                        setTimeout(function() {
                            var body = document.querySelector('.activity__body');
                            if (body) Components.main(e.data, body);
                        }, 50);
                    }
                });
            }

            setTimeout(function() {
                Menu.addToSidebar();
            }, 1500);
        }
    };

    function waitForLampa() {
        if (window.Lampa && Lampa.Listener && Lampa.Component) {
            Init.run();
        } else {
            var attempts = 0;
            var interval = setInterval(function() {
                attempts++;
                if (window.Lampa && Lampa.Listener && Lampa.Component) {
                    clearInterval(interval);
                    Init.run();
                } else if (attempts > 50) {
                    clearInterval(interval);
                    console.error('YouTube plugin: Lampa not found');
                }
            }, 200);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForLampa);
    } else {
        waitForLampa();
    }

})();