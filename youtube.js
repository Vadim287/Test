(function() {
    'use strict';

    function startPlugin() {
        window.plugin_youtube_ready = true;

        var network = new Lampa.Reguest();
        var Config = {
            piped_instances: [
                'https://pipedapi.kavin.rocks',
                'https://pipedapi.adminforge.de',
                'https://pipedapi.syncpundit.io'
            ],
            invidious_instances: [
                'https://inv.nadeko.net',
                'https://invidious.fdn.fr'
            ],
            backend: 'auto',
            quality: '1080',
            piped_index: 0,
            invidious_index: 0
        };

        function getBackendUrl(type) {
            if (type === 'piped') {
                return Config.piped_instances[Config.piped_index % Config.piped_instances.length];
            }
            return Config.invidious_instances[Config.invidious_index % Config.invidious_instances.length];
        }

        function switchInstance(type) {
            if (type === 'piped') {
                Config.piped_index = (Config.piped_index + 1) % Config.piped_instances.length;
            } else {
                Config.invidious_index = (Config.invidious_index + 1) % Config.invidious_instances.length;
            }
        }

        function apiCall(endpoint, params, onSuccess, onError) {
            params = params || {};
            var backends = Config.backend === 'auto' ? ['piped', 'invidious'] : [Config.backend];

            function tryBackend(index) {
                if (index >= backends.length) {
                    if (onError) onError('All backends failed');
                    return;
                }

                var type = backends[index];
                var baseUrl = getBackendUrl(type);
                var url = baseUrl + endpoint;
                var query = [];
                for (var k in params) {
                    query.push(k + '=' + encodeURIComponent(params[k]));
                }
                if (query.length) url += '?' + query.join('&');

                network.silent(url, function(data) {
                    if (onSuccess) onSuccess(data, type);
                }, function() {
                    switchInstance(type);
                    tryBackend(index + 1);
                });
            }

            tryBackend(0);
        }

        function parseList(data) {
            var items = [];
            var list = data.items || data.relatedStreams || [];
            if (!Array.isArray(list)) list = [];

            list.forEach(function(item) {
                if (!item) return;
                var url = item.url || '';
                var videoId = item.videoId || item.id || '';
                if (!videoId && url) {
                    var m = url.match(/[?&]v=([^&]+)/) || url.match(/\/watch\/([^?&]+)/);
                    if (m) videoId = m[1];
                }
                if (!videoId) return;

                var channelId = item.uploaderUrl ? item.uploaderUrl.replace('/channel/', '') : (item.authorId || '');
                var thumb = item.thumbnail || '';
                if (thumb && thumb.indexOf('http') !== 0) thumb = 'https:' + thumb;

                items.push({
                    videoId: videoId,
                    title: item.title || '',
                    channel: item.uploader || item.author || '',
                    channelId: channelId,
                    thumbnail: thumb,
                    views: item.views || 0,
                    duration: item.duration || item.lengthSeconds || 0,
                    uploaded: item.uploadedDate || item.publishedText || ''
                });
            });

            return items;
        }

        function parseVideo(data) {
            var streams = [];
            if (data.videoStreams) {
                data.videoStreams.forEach(function(s) {
                    if (s.url) {
                        streams.push({
                            url: s.url,
                            quality: (s.quality || '').replace('p', ''),
                            format: s.format || 'MPEG_4'
                        });
                    }
                });
            }
            if (data.hls) {
                streams.push({
                    url: data.hls,
                    quality: 'auto',
                    format: 'HLS'
                });
            }

            var related = [];
            if (data.relatedStreams) {
                data.relatedStreams.forEach(function(r) {
                    var url = r.url || '';
                    var vid = url.match(/[?&]v=([^&]+)/);
                    if (vid) {
                        related.push({
                            videoId: vid[1],
                            title: r.title || '',
                            channel: r.uploader || '',
                            thumbnail: r.thumbnail || '',
                            duration: r.duration || 0,
                            views: r.views || 0
                        });
                    }
                });
            }

            return {
                id: data.id || '',
                title: data.title || '',
                description: data.description || '',
                channel: data.uploader || '',
                channelId: data.uploaderUrl ? data.uploaderUrl.replace('/channel/', '') : '',
                views: data.views || 0,
                likes: data.likes || 0,
                duration: data.duration || 0,
                thumbnail: data.thumbnailUrl || '',
                streams: streams,
                related: related
            };
        }

        function formatViews(n) {
            if (!n) return '';
            if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return String(n);
        }

        function formatDuration(sec) {
            if (!sec) return '';
            sec = parseInt(sec);
            var h = Math.floor(sec / 3600);
            var m = Math.floor((sec % 3600) / 60);
            var s = sec % 60;
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function pickStream(streams) {
            if (!streams || !streams.length) return null;
            var preferred = Lampa.Storage.get('youtube_quality', '1080');
            var hls = null;
            var mp4_by_q = {};

            streams.forEach(function(s) {
                if (s.format === 'HLS') hls = s;
                else if (s.quality) mp4_by_q[s.quality] = s;
            });

            if (preferred === 'auto' && hls) return hls;

            var order = ['2160', '1440', '1080', '720', '480', '360'];
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

        function playVideo(video) {
            var stream = pickStream(video.streams);

            if (!stream) {
                Lampa.Noty.show('No playable streams found');
                return;
            }

            var videoObj = {
                title: video.title,
                url: stream.url,
                poster: video.thumbnail
            };

            Lampa.Player.play(videoObj);
        }

        function add() {
            Lampa.Component.add('youtube_main', {
                template: '<div class="youtube-main"></div>',
                data: function() {
                    return {
                        items: [
                            { title: 'Trending', icon: '🔥', action: 'trending' },
                            { title: 'Popular', icon: '📈', action: 'popular' },
                            { title: 'Search', icon: '🔍', action: 'search' },
                            { title: 'History', icon: '🕐', action: 'history' },
                            { title: 'Favorites', icon: '❤️', action: 'favorites' },
                            { title: 'Settings', icon: '⚙️', action: 'settings' }
                        ]
                    };
                },
                mounted: function() {
                    var self = this;
                    var container = this.$el.find('.youtube-main');
                    
                    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1em;padding:2em">';
                    this.data.items.forEach(function(item) {
                        html += '<div class="selector" data-action="' + item.action + '" style="background:#2a2a2a;padding:2em;border-radius:8px;text-align:center;cursor:pointer">';
                        html += '<div style="font-size:3em;margin-bottom:.5em">' + item.icon + '</div>';
                        html += '<div style="color:#fff;font-size:1.1em">' + item.title + '</div>';
                        html += '</div>';
                    });
                    html += '</div>';
                    
                    container.html(html);
                    
                    container.find('[data-action]').on('hover:enter', function() {
                        var action = $(this).data('action');
                        if (action === 'trending') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Trending',
                                component: 'youtube_trending',
                                page: 1
                            });
                        } else if (action === 'popular') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Popular',
                                component: 'youtube_popular',
                                page: 1
                            });
                        } else if (action === 'search') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Search',
                                component: 'youtube_search',
                                page: 1
                            });
                        } else if (action === 'history') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube History',
                                component: 'youtube_history',
                                page: 1
                            });
                        } else if (action === 'favorites') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Favorites',
                                component: 'youtube_favorites',
                                page: 1
                            });
                        } else if (action === 'settings') {
                            Lampa.Settings.open();
                        }
                    });
                }
            });

            Lampa.Component.add('youtube_trending', {
                template: '<div class="youtube-trending"></div>',
                mounted: function() {
                    var self = this;
                    var container = this.$el.find('.youtube-trending');
                    container.html('<div style="padding:2em;color:#fff">Loading...</div>');
                    
                    apiCall('/trending', { region: 'US' }, function(data) {
                        var items = parseList(data);
                        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em;padding:2em">';
                        
                        items.forEach(function(item) {
                            html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                            html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover">';
                            html += '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em">' + formatDuration(item.duration) + '</div>';
                            html += '</div>';
                            html += '<div style="padding:.75em">';
                            html += '<div style="color:#fff;font-size:.95em;margin-bottom:.3em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                            html += '<div style="color:#aaa;font-size:.8em">' + item.channel + ' • ' + formatViews(item.views) + ' views</div>';
                            html += '</div></div>';
                        });
                        
                        html += '</div>';
                        container.html(html);
                        
                        container.find('[data-video-id]').on('hover:enter', function() {
                            var videoId = $(this).data('video-id');
                            Lampa.Activity.push({
                                url: '',
                                title: 'Video',
                                component: 'youtube_video',
                                videoId: videoId
                            });
                        });
                    }, function() {
                        container.html('<div style="padding:2em;color:#fff">Failed to load trending</div>');
                    });
                }
            });

            Lampa.Component.add('youtube_popular', {
                template: '<div class="youtube-popular"></div>',
                mounted: function() {
                    var container = this.$el.find('.youtube-popular');
                    container.html('<div style="padding:2em;color:#fff">Loading...</div>');
                    
                    apiCall('/trending', { region: 'US' }, function(data) {
                        var items = parseList(data);
                        items.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
                        
                        var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em;padding:2em">';
                        
                        items.forEach(function(item) {
                            html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                            html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover">';
                            html += '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em">' + formatDuration(item.duration) + '</div>';
                            html += '</div>';
                            html += '<div style="padding:.75em">';
                            html += '<div style="color:#fff;font-size:.95em;margin-bottom:.3em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                            html += '<div style="color:#aaa;font-size:.8em">' + item.channel + ' • ' + formatViews(item.views) + ' views</div>';
                            html += '</div></div>';
                        });
                        
                        html += '</div>';
                        container.html(html);
                        
                        container.find('[data-video-id]').on('hover:enter', function() {
                            var videoId = $(this).data('video-id');
                            Lampa.Activity.push({
                                url: '',
                                title: 'Video',
                                component: 'youtube_video',
                                videoId: videoId
                            });
                        });
                    }, function() {
                        container.html('<div style="padding:2em;color:#fff">Failed to load popular</div>');
                    });
                }
            });

            Lampa.Component.add('youtube_search', {
                template: '<div class="youtube-search"></div>',
                mounted: function() {
                    var container = this.$el.find('.youtube-search');
                    container.html('<div style="padding:2em"><input type="text" class="youtube-search-input" placeholder="Search YouTube..." style="width:100%;padding:.8em;background:#2a2a2a;border:2px solid #444;border-radius:8px;color:#fff;font-size:1em;box-sizing:border-box"></div><div class="youtube-search-results"></div>');
                    
                    var input = container.find('.youtube-search-input');
                    var results = container.find('.youtube-search-results');
                    var timer = null;
                    
                    input.on('input', function() {
                        clearTimeout(timer);
                        timer = setTimeout(function() {
                            var q = input.val().trim();
                            if (!q) {
                                results.html('');
                                return;
                            }
                            results.html('<div style="padding:2em;color:#fff">Searching...</div>');
                            
                            apiCall('/search', { q: q }, function(data) {
                                var items = parseList(data);
                                if (!items.length) {
                                    results.html('<div style="padding:2em;color:#fff">No results found</div>');
                                    return;
                                }
                                
                                var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em;padding:2em">';
                                items.forEach(function(item) {
                                    html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                                    html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover">';
                                    html += '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em">' + formatDuration(item.duration) + '</div>';
                                    html += '</div>';
                                    html += '<div style="padding:.75em">';
                                    html += '<div style="color:#fff;font-size:.95em;margin-bottom:.3em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                                    html += '<div style="color:#aaa;font-size:.8em">' + item.channel + '</div>';
                                    html += '</div></div>';
                                });
                                html += '</div>';
                                
                                results.html(html);
                                
                                results.find('[data-video-id]').on('hover:enter', function() {
                                    var videoId = $(this).data('video-id');
                                    Lampa.Activity.push({
                                        url: '',
                                        title: 'Video',
                                        component: 'youtube_video',
                                        videoId: videoId
                                    });
                                });
                            }, function() {
                                results.html('<div style="padding:2em;color:#fff">Search failed</div>');
                            });
                        }, 400);
                    });
                    
                    setTimeout(function() { input.focus(); }, 100);
                }
            });

            Lampa.Component.add('youtube_history', {
                template: '<div class="youtube-history"></div>',
                mounted: function() {
                    var container = this.$el.find('.youtube-history');
                    var history = Lampa.Storage.get('youtube_history', []);
                    
                    if (!history.length) {
                        container.html('<div style="padding:2em;color:#fff">History is empty</div>');
                        return;
                    }
                    
                    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em;padding:2em">';
                    history.forEach(function(item) {
                        html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                        html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover">';
                        html += '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em">' + formatDuration(item.duration) + '</div>';
                        html += '</div>';
                        html += '<div style="padding:.75em">';
                        html += '<div style="color:#fff;font-size:.95em;margin-bottom:.3em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                        html += '<div style="color:#aaa;font-size:.8em">' + item.channel + '</div>';
                        html += '</div></div>';
                    });
                    html += '</div>';
                    
                    container.html(html);
                    
                    container.find('[data-video-id]').on('hover:enter', function() {
                        var videoId = $(this).data('video-id');
                        Lampa.Activity.push({
                            url: '',
                            title: 'Video',
                            component: 'youtube_video',
                            videoId: videoId
                        });
                    });
                }
            });

            Lampa.Component.add('youtube_favorites', {
                template: '<div class="youtube-favorites"></div>',
                mounted: function() {
                    var container = this.$el.find('.youtube-favorites');
                    var favorites = Lampa.Storage.get('youtube_favorites', []);
                    
                    if (!favorites.length) {
                        container.html('<div style="padding:2em;color:#fff">Favorites is empty</div>');
                        return;
                    }
                    
                    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em;padding:2em">';
                    favorites.forEach(function(item) {
                        html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                        html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover">';
                        html += '<div style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,.85);color:#fff;padding:2px 6px;border-radius:3px;font-size:.8em">' + formatDuration(item.duration) + '</div>';
                        html += '</div>';
                        html += '<div style="padding:.75em">';
                        html += '<div style="color:#fff;font-size:.95em;margin-bottom:.3em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                        html += '<div style="color:#aaa;font-size:.8em">' + item.channel + '</div>';
                        html += '</div></div>';
                    });
                    html += '</div>';
                    
                    container.html(html);
                    
                    container.find('[data-video-id]').on('hover:enter', function() {
                        var videoId = $(this).data('video-id');
                        Lampa.Activity.push({
                            url: '',
                            title: 'Video',
                            component: 'youtube_video',
                            videoId: videoId
                        });
                    });
                }
            });

            Lampa.Component.add('youtube_video', {
                template: '<div class="youtube-video"></div>',
                mounted: function() {
                    var container = this.$el.find('.youtube-video');
                    var videoId = this.activity.data && this.activity.data.videoId;
                    
                    if (!videoId) {
                        container.html('<div style="padding:2em;color:#fff">No video id</div>');
                        return;
                    }
                    
                    container.html('<div style="padding:2em;color:#fff">Loading video...</div>');
                    
                    apiCall('/streams/' + videoId, {}, function(data) {
                        var video = parseVideo(data);
                        
                        var history = Lampa.Storage.get('youtube_history', []);
                        history = history.filter(function(v) { return v.videoId !== video.id; });
                        history.unshift({
                            videoId: video.id,
                            title: video.title,
                            thumbnail: video.thumbnail,
                            channel: video.channel,
                            duration: video.duration
                        });
                        if (history.length > 50) history = history.slice(0, 50);
                        Lampa.Storage.set('youtube_history', history);
                        
                        playVideo(video);
                        
                        var html = '<div style="padding:2em;max-width:1200px;margin:0 auto">';
                        html += '<h1 style="color:#fff;margin-bottom:.5em">' + video.title + '</h1>';
                        html += '<div style="color:#aaa;margin-bottom:1em">' + video.channel + ' • ' + formatViews(video.views) + ' views</div>';
                        html += '<div style="display:flex;gap:.5em;margin-bottom:1em;flex-wrap:wrap">';
                        html += '<button class="selector youtube-fav-btn" style="background:#2a2a2a;color:#fff;border:none;padding:.5em 1em;border-radius:6px;cursor:pointer">❤️ Favorite</button>';
                        html += '</div>';
                        if (video.description) {
                            html += '<div style="color:#ccc;font-size:.95em;line-height:1.5;white-space:pre-wrap;max-height:200px;overflow:auto;padding:1em;background:#1a1a1a;border-radius:8px">' + video.description.replace(/</g, '&lt;') + '</div>';
                        }
                        
                        if (video.related && video.related.length) {
                            html += '<h2 style="color:#fff;margin:1.5em 0 .5em">Related Videos</h2>';
                            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1em">';
                            video.related.forEach(function(item) {
                                html += '<div class="selector" data-video-id="' + item.videoId + '" style="background:#2a2a2a;border-radius:8px;overflow:hidden;cursor:pointer">';
                                html += '<div style="position:relative;padding-top:56.25%;background:url(' + item.thumbnail + ') center/cover"></div>';
                                html += '<div style="padding:.75em">';
                                html += '<div style="color:#fff;font-size:.95em">' + Lampa.Utils.shortText(item.title, 60) + '</div>';
                                html += '</div></div>';
                            });
                            html += '</div>';
                        }
                        
                        html += '</div>';
                        container.html(html);
                        
                        container.find('.youtube-fav-btn').on('hover:enter click', function() {
                            var favorites = Lampa.Storage.get('youtube_favorites', []);
                            var idx = favorites.findIndex(function(v) { return v.videoId === video.id; });
                            if (idx >= 0) {
                                favorites.splice(idx, 1);
                                $(this).text('❤️ Favorite');
                            } else {
                                favorites.unshift({
                                    videoId: video.id,
                                    title: video.title,
                                    thumbnail: video.thumbnail,
                                    channel: video.channel,
                                    duration: video.duration
                                });
                                $(this).text('❤️ Favorited');
                            }
                            Lampa.Storage.set('youtube_favorites', favorites);
                        });
                        
                        container.find('[data-video-id]').on('hover:enter', function() {
                            var vid = $(this).data('video-id');
                            Lampa.Activity.push({
                                url: '',
                                title: 'Video',
                                component: 'youtube_video',
                                videoId: vid
                            });
                        });
                    }, function() {
                        container.html('<div style="padding:2em;color:#fff">Failed to load video</div>');
                    });
                }
            });

            var button = $('<li class="menu__item selector">' +
                '<div class="menu__ico">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">' +
                '<path d="M10 15L15.19 12L10 9V15ZM21.54 8.47L13.54 2.47C12.63 1.8 11.37 1.8 10.46 2.47L2.46 8.47C1.55 9.14 1.13 10.2 1.31 11.22L1.34 11.3C1.45 11.79 1.69 12.24 2.05 12.59L2.46 12.89L10.46 18.89C11.37 19.56 12.63 19.56 13.54 18.89L21.54 12.89C22.45 12.22 22.87 11.16 22.69 10.14L22.66 10.06C22.55 9.57 22.31 9.12 21.95 8.77L21.54 8.47Z"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu__text">YouTube</div>' +
                '</li>');

            button.on('hover:enter', function() {
                Lampa.Activity.push({
                    url: '',
                    title: 'YouTube',
                    component: 'youtube_main',
                    page: 1
                });
            });

            $('.menu .menu__list').eq(0).append(button);

            Config.backend = Lampa.Storage.get('youtube_backend', 'auto');
            Config.quality = Lampa.Storage.get('youtube_quality', '1080');

            Lampa.SettingsApi.addComponent({
                component: 'youtube',
                name: 'YouTube',
                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15L15.19 12L10 9V15ZM21.54 8.47L13.54 2.47C12.63 1.8 11.37 1.8 10.46 2.47L2.46 8.47C1.55 9.14 1.13 10.2 1.31 11.22L1.34 11.3C1.45 11.79 1.69 12.24 2.05 12.59L2.46 12.89L10.46 18.89C11.37 19.56 12.63 19.56 13.54 18.89L21.54 12.89C22.45 12.22 22.87 11.16 22.69 10.14L22.66 10.06C22.55 9.57 22.31 9.12 21.95 8.77L21.54 8.47Z"/></svg>'
            });

            Lampa.SettingsApi.addParam({
                component: 'youtube',
                param: {
                    name: 'youtube_backend',
                    type: 'select',
                    values: {
                        'auto': 'Auto',
                        'piped': 'Piped',
                        'invidious': 'Invidious'
                    },
                    default: 'auto'
                },
                field: {
                    name: 'Backend',
                    description: 'Choose API backend'
                },
                onChange: function(value) {
                    Lampa.Storage.set('youtube_backend', value);
                    Config.backend = value;
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'youtube',
                param: {
                    name: 'youtube_quality',
                    type: 'select',
                    values: {
                        'auto': 'Auto',
                        '2160': '4K',
                        '1440': '1440p',
                        '1080': '1080p',
                        '720': '720p',
                        '480': '480p',
                        '360': '360p'
                    },
                    default: '1080'
                },
                field: {
                    name: 'Default Quality',
                    description: 'Preferred video quality'
                },
                onChange: function(value) {
                    Lampa.Storage.set('youtube_quality', value);
                    Config.quality = value;
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'youtube',
                param: {
                    name: 'youtube_clear_history',
                    type: 'button'
                },
                field: {
                    name: 'Clear History'
                },
                onChange: function() {
                    Lampa.Storage.set('youtube_history', []);
                    Lampa.Noty.show('History cleared');
                }
            });

            Lampa.SettingsApi.addParam({
                component: 'youtube',
                param: {
                    name: 'youtube_clear_favorites',
                    type: 'button'
                },
                field: {
                    name: 'Clear Favorites'
                },
                onChange: function() {
                    Lampa.Storage.set('youtube_favorites', []);
                    Lampa.Noty.show('Favorites cleared');
                }
            });
        }

        if (window.appready) add();
        else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') add();
            });
        }
    }

    if (!window.plugin_youtube_ready) startPlugin();

})();