(function() {
    'use strict';

    if (window.youtube_plugin_ready) return;
    window.youtube_plugin_ready = true;

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
        piped_index: 0,
        invidious_index: 0,
        quality: '1080'
    };

    function Storage_get(key, def) {
        return Lampa.Storage.get('youtube_' + key, def);
    }

    function Storage_set(key, val) {
        Lampa.Storage.set('youtube_' + key, val);
    }

    function request(url, onSuccess, onError) {
        network.silent(url, onSuccess, onError);
    }

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

            request(url, function(data) {
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
        var preferred = Storage_get('quality', '1080');
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
        var controller_enabled = Lampa.Controller.enabled().name;
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

        Lampa.Player.iptv(videoObj);
        Lampa.Player.playlist([videoObj]);
        Lampa.Player.callback(function() {
            Lampa.Controller.toggle(controller_enabled);
        });
    }

    function MainMenu(object) {
        var comp = new Lampa.InteractionMain(object);

        comp.create = function() {
            this.activity.loader(true);
            
            var items = [
                { title: 'Trending', icon: '🔥', action: 'trending' },
                { title: 'Popular', icon: '📈', action: 'popular' },
                { title: 'Search', icon: '🔍', action: 'search' },
                { title: 'History', icon: '🕐', action: 'history' },
                { title: 'Favorites', icon: '❤️', action: 'favorites' },
                { title: 'Settings', icon: '⚙️', action: 'settings' }
            ];

            var results = items.map(function(item) {
                return {
                    title: item.title,
                    poster: 'https://via.placeholder.com/300x170/2a2a2a/ffffff?text=' + encodeURIComponent(item.icon + ' ' + item.title),
                    action: item.action
                };
            });

            this.build({
                results: results,
                card_events: {
                    onEnter: function(card, element) {
                        if (element.action === 'trending') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Trending',
                                component: 'youtube_trending',
                                page: 1
                            });
                        } else if (element.action === 'popular') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Popular',
                                component: 'youtube_popular',
                                page: 1
                            });
                        } else if (element.action === 'search') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Search',
                                component: 'youtube_search',
                                page: 1
                            });
                        } else if (element.action === 'history') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube History',
                                component: 'youtube_history',
                                page: 1
                            });
                        } else if (element.action === 'favorites') {
                            Lampa.Activity.push({
                                url: '',
                                title: 'YouTube Favorites',
                                component: 'youtube_favorites',
                                page: 1
                            });
                        } else if (element.action === 'settings') {
                            Lampa.Settings.open();
                        }
                    }
                }
            });

            return this.render();
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'Failed to load YouTube menu'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function TrendingPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            this.activity.loader(true);
            
            apiCall('/trending', { region: 'US' }, function(data) {
                var items = parseList(data);
                items.forEach(function(item) {
                    item.title = Lampa.Utils.shortText(item.title, 60);
                });

                comp.build({
                    results: items,
                    card_events: {
                        onEnter: function(card, element) {
                            Lampa.Activity.push({
                                url: '',
                                title: element.title,
                                component: 'youtube_video',
                                videoId: element.videoId
                            });
                        }
                    }
                });
            }, function() {
                comp.empty();
            });
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'Failed to load trending videos'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function PopularPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            this.activity.loader(true);
            
            apiCall('/trending', { region: 'US' }, function(data) {
                var items = parseList(data);
                items.sort(function(a, b) { return (b.views || 0) - (a.views || 0); });
                items.forEach(function(item) {
                    item.title = Lampa.Utils.shortText(item.title, 60);
                });

                comp.build({
                    results: items,
                    card_events: {
                        onEnter: function(card, element) {
                            Lampa.Activity.push({
                                url: '',
                                title: element.title,
                                component: 'youtube_video',
                                videoId: element.videoId
                            });
                        }
                    }
                });
            }, function() {
                comp.empty();
            });
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'Failed to load popular videos'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function SearchPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            var query = Storage_get('last_search', '');
            
            if (query) {
                this.activity.loader(true);
                apiCall('/search', { q: query }, function(data) {
                    var items = parseList(data);
                    items.forEach(function(item) {
                        item.title = Lampa.Utils.shortText(item.title, 60);
                    });

                    comp.build({
                        results: items,
                        card_events: {
                            onEnter: function(card, element) {
                                Lampa.Activity.push({
                                    url: '',
                                    title: element.title,
                                    component: 'youtube_video',
                                    videoId: element.videoId
                                });
                            }
                        }
                    });
                }, function() {
                    comp.empty();
                });
            } else {
                var input = prompt('Search YouTube:');
                if (input) {
                    Storage_set('last_search', input);
                    comp.create.call(comp);
                } else {
                    Lampa.Controller.toggle('menu');
                }
            }
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'No results found'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function HistoryPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            var history = Storage_get('history', []);
            
            if (history.length) {
                comp.build({
                    results: history,
                    card_events: {
                        onEnter: function(card, element) {
                            Lampa.Activity.push({
                                url: '',
                                title: element.title,
                                component: 'youtube_video',
                                videoId: element.videoId
                            });
                        }
                    }
                });
            } else {
                comp.empty();
            }
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'History is empty'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function FavoritesPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            var favorites = Storage_get('favorites', []);
            
            if (favorites.length) {
                comp.build({
                    results: favorites,
                    card_events: {
                        onEnter: function(card, element) {
                            Lampa.Activity.push({
                                url: '',
                                title: element.title,
                                component: 'youtube_video',
                                videoId: element.videoId
                            });
                        }
                    }
                });
            } else {
                comp.empty();
            }
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'Favorites is empty'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function VideoPage(object) {
        var comp = new Lampa.InteractionCategory(object);

        comp.create = function() {
            var videoId = object.videoId;
            if (!videoId) {
                comp.empty();
                return;
            }

            this.activity.loader(true);
            
            apiCall('/streams/' + videoId, {}, function(data) {
                var video = parseVideo(data);
                
                var history = Storage_get('history', []);
                history = history.filter(function(v) { return v.videoId !== video.id; });
                history.unshift({
                    videoId: video.id,
                    title: video.title,
                    thumbnail: video.thumbnail,
                    channel: video.channel,
                    duration: video.duration
                });
                if (history.length > 50) history = history.slice(0, 50);
                Storage_set('history', history);

                playVideo(video);

                if (video.related && video.related.length) {
                    video.related.forEach(function(item) {
                        item.title = Lampa.Utils.shortText(item.title, 60);
                    });

                    comp.build({
                        results: video.related,
                        card_events: {
                            onEnter: function(card, element) {
                                Lampa.Activity.push({
                                    url: '',
                                    title: element.title,
                                    component: 'youtube_video',
                                    videoId: element.videoId
                                });
                            }
                        }
                    });
                } else {
                    comp.empty();
                }
            }, function() {
                comp.empty();
            });
        };

        comp.empty = function() {
            var empty = new Lampa.Empty({
                descr: 'Failed to load video'
            });
            this.activity.loader(false);
            this.activity.toggle();
        };

        return comp;
    }

    function startPlugin() {
        Lampa.Component.add('youtube_main', MainMenu);
        Lampa.Component.add('youtube_trending', TrendingPage);
        Lampa.Component.add('youtube_popular', PopularPage);
        Lampa.Component.add('youtube_search', SearchPage);
        Lampa.Component.add('youtube_history', HistoryPage);
        Lampa.Component.add('youtube_favorites', FavoritesPage);
        Lampa.Component.add('youtube_video', VideoPage);

        Config.backend = Storage_get('backend', 'auto');
        Config.quality = Storage_get('quality', '1080');

        function addMenuButton() {
            var button = $('<li class="menu__item selector">' +
                '<div class="menu__ico">' +
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M10 15L15.19 12L10 9V15ZM21.54 8.47L13.54 2.47C12.63 1.8 11.37 1.8 10.46 2.47L2.46 8.47C1.55 9.14 1.13 10.2 1.31 11.22L1.34 11.3C1.45 11.79 1.69 12.24 2.05 12.59L2.46 12.89L10.46 18.89C11.37 19.56 12.63 19.56 13.54 18.89L21.54 12.89C22.45 12.22 22.87 11.16 22.69 10.14L22.66 10.06C22.55 9.57 22.31 9.12 21.95 8.77L21.54 8.47Z" fill="currentColor"/>' +
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
        }

        function addSettings() {
            if (window.youtube_settings_ready) return;
            window.youtube_settings_ready = true;

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
                    Storage_set('backend', value);
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
                    Storage_set('quality', value);
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
                    Storage_set('history', []);
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
                    Storage_set('favorites', []);
                    Lampa.Noty.show('Favorites cleared');
                }
            });
        }

        if (window.appready) {
            addMenuButton();
            addSettings();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    addMenuButton();
                    addSettings();
                }
            });
        }
    }

    if (!window.youtube_plugin_ready) {
        startPlugin();
    }

})();