(function () {

  var ID = 'youtube';

  var piped_list = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.syncpundit.io'
  ];

  var inv_list = [
    'https://inv.nadeko.net'
  ];

  var store = {
    cache: ID + '_cache',
    history: ID + '_history',
    fav: ID + '_fav',
    settings: ID + '_settings'
  };

  function ls(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : def;
    } catch (e) {
      return def;
    }
  }

  function ss(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function settings() {
    return Object.assign({
      backend: 'auto',
      piped: 0,
      inv: 0,
      quality: 'auto'
    }, ls(store.settings, {}));
  }

  function cache_get() {
    return ls(store.cache, {});
  }

  function cache_set(v) {
    ss(store.cache, v);
  }

  function request(url) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 12000;

      xhr.onload = function () {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (e) {
          reject(e);
        }
      };

      xhr.onerror = reject;
      xhr.ontimeout = reject;
      xhr.send();
    });
  }

  function piped() {
    var s = settings();
    return piped_list[s.piped] || piped_list[0];
  }

  function inv() {
    var s = settings();
    return inv_list[s.inv] || inv_list[0];
  }

  function map_item(v) {
    return {
      id: v.videoId || v.id,
      title: v.title,
      subtitle: v.uploaderName || v.author,
      img: v.thumbnail || (v.videoThumbnails && v.videoThumbnails[0].url)
    };
  }

  function search(q) {
    var c = cache_get();
    if (c['s_' + q]) return Promise.resolve(c['s_' + q]);

    return request(piped() + '/search?q=' + encodeURIComponent(q))
      .then(function (r) {
        var res = (r.items || r).map(map_item);
        c['s_' + q] = res;
        cache_set(c);
        return res;
      })
      .catch(function () {
        return request(inv() + '/api/v1/search?q=' + encodeURIComponent(q))
          .then(function (r) {
            var res = r.map(map_item);
            c['s_' + q] = res;
            cache_set(c);
            return res;
          });
      });
  }

  function trending() {
    var c = cache_get();
    if (c.t) return Promise.resolve(c.t);

    return request(piped() + '/trending')
      .then(function (r) {
        var res = (r.items || r).map(map_item);
        c.t = res;
        cache_set(c);
        return res;
      })
      .catch(function () {
        return request(inv() + '/api/v1/trending')
          .then(function (r) {
            var res = r.map(map_item);
            c.t = res;
            cache_set(c);
            return res;
          });
      });
  }

  function open(item) {
    Lampa.Activity.push({
      title: item.title,
      component: 'youtube_view',
      page: item
    });
  }

  function component_list(type) {
    return function () {

      var html = Lampa.Template.get('activity', { title: 'YouTube' });
      var body = $('<div class="youtube"></div>');

      html.find('.activity__content').append(body);

      function render(items) {
        body.empty();

        items.forEach(function (v) {
          var el = $('<div class="yt-item"></div>');

          el.append('<div class="img"><img src="' + v.img + '"></div>');
          el.append('<div class="title">' + v.title + '</div>');

          el.on('click', function () {
            open(v);
          });

          body.append(el);
        });
      }

      if (type === 'trending') {
        trending().then(render);
      }

      return html;
    };
  }

  function component_search() {
    return function () {

      var html = Lampa.Template.get('activity', { title: 'YouTube Search' });
      var body = $('<div class="youtube-search"></div>');
      var input = $('<input class="yt-input" placeholder="Search">');

      input.on('change', function () {
        search(input.val()).then(function (r) {
          body.find('.res').remove();
          var grid = $('<div class="res"></div>');
          r.forEach(function (v) {
            var el = $('<div class="yt-item"></div>');
            el.text(v.title);
            el.on('click', function () {
              open(v);
            });
            grid.append(el);
          });
          body.append(grid);
        });
      });

      body.append(input);
      html.find('.activity__content').append(body);

      return html;
    };
  }

  function component_view() {
    return function (data) {

      var v = data.page;

      var html = Lampa.Template.get('activity', { title: v.title });
      var body = $('<div class="youtube-view"></div>');

      body.append('<div class="title">' + v.title + '</div>');

      html.find('.activity__content').append(body);

      return html;
    };
  }

  function init() {

    Lampa.Component.add('youtube_trending', component_list('trending'));
    Lampa.Component.add('youtube_search', component_search());
    Lampa.Component.add('youtube_view', component_view());

    Lampa.Menu.add({
      id: 'youtube',
      title: 'YouTube',
      icon: 'youtube',
      onSelect: function () {
        Lampa.Activity.push({
          title: 'YouTube',
          component: 'youtube_trending'
        });
      }
    });

  }

  if (window.appready) init();
  else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') init();
    });
  }

})();        }
    }

    function getInstances(backend) {
        var custom_key = backend === 'piped' ? STORAGE_PIPED_CUSTOM : STORAGE_INVIDIOUS_CUSTOM;
        var custom = Lampa.Storage.get(custom_key, '');
        var list = [];
        if (custom) list.push(custom.replace(/\/+$/, ''));
        var defaults = BACKEND_INSTANCES[backend] || [];
        for (var i = 0; i < defaults.length; i++) {
            if (list.indexOf(defaults[i]) === -1) list.push(defaults[i]);
        }
        return list;
    }

    function requestOne(base, path, timeout) {
        return new Promise(function (resolve, reject) {
            var url = base + path;
            var xhr = new XMLHttpRequest();
            var done = false;
            var timer = setTimeout(function () {
                if (done) return;
                done = true;
                try { xhr.abort(); } catch (e) {}
                reject(new Error('timeout'));
            }, timeout);

            try {
                xhr.open('GET', url, true);
            } catch (e) {
                clearTimeout(timer);
                reject(e);
                return;
            }

            xhr.timeout = timeout;

            xhr.onload = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        reject(new Error('parse_error'));
                    }
                } else {
                    reject(new Error('http_' + xhr.status));
                }
            };

            xhr.onerror = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(new Error('network_error'));
            };

            xhr.ontimeout = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(new Error('timeout'));
            };

            xhr.send();
        });
    }

    function tryInstanceWithRetries(base, path, retries) {
        var chain = Promise.reject(new Error('init'));
        for (var i = 0; i < retries; i++) {
            chain = chain.catch(function () {
                return requestOne(base, path, REQUEST_TIMEOUT);
            });
        }
        return chain;
    }

    function sequentialTry(items, fn) {
        var chain = Promise.reject(new Error('init'));
        items.forEach(function (item) {
            chain = chain.catch(function () {
                return fn(item);
            });
        });
        return chain;
    }

    function buildPath(backend, kind, args) {
        args = args || {};
        if (backend === 'piped') {
            if (kind === 'search') return '/search?q=' + encodeURIComponent(args.q) + '&filter=' + encodeURIComponent(args.filter || 'all');
            if (kind === 'trending') return '/trending?region=' + encodeURIComponent(args.region || 'US');
            if (kind === 'streams') return '/streams/' + encodeURIComponent(args.id);
            if (kind === 'channel') return '/channel/' + encodeURIComponent(args.id);
            if (kind === 'channel_next') return '/nextpage/channel/' + encodeURIComponent(args.id) + '?nextpage=' + encodeURIComponent(args.nextpage);
            if (kind === 'playlist') return '/playlists/' + encodeURIComponent(args.id);
        } else {
            if (kind === 'search') return '/api/v1/search?q=' + encodeURIComponent(args.q);
            if (kind === 'trending') return '/api/v1/trending?region=' + encodeURIComponent(args.region || 'US');
            if (kind === 'streams') return '/api/v1/videos/' + encodeURIComponent(args.id);
            if (kind === 'channel') return '/api/v1/channels/' + encodeURIComponent(args.id);
            if (kind === 'channel_next') return '/api/v1/channels/' + encodeURIComponent(args.id) + '/videos?continuation=' + encodeURIComponent(args.nextpage);
            if (kind === 'playlist') return '/api/v1/playlists/' + encodeURIComponent(args.id);
        }
        return '';
    }

    function backendRequest(backend, kind, args) {
        var instances = getInstances(backend);
        var path = buildPath(backend, kind, args);
        return sequentialTry(instances, function (base) {
            return tryInstanceWithRetries(base, path, RETRIES_PER_INSTANCE);
        }).then(function (data) {
            return { backend: backend, data: data };
        });
    }

    function unifiedRequest(kind, args, use_cache) {
        var cache_key = kind + '|' + JSON.stringify(args || {});
        if (use_cache !== false) {
            var cached = cacheGet(cache_key);
            if (cached) return Promise.resolve(cached);
        }

        var mode = Lampa.Storage.get(STORAGE_BACKEND, 'auto') || 'auto';
        var backends = mode === 'auto' ? ['piped', 'invidious'] : [mode];

        return sequentialTry(backends, function (backend) {
            return backendRequest(backend, kind, args);
        }).then(function (result) {
            if (use_cache !== false) cacheSet(cache_key, result);
            return result;
        });
    }

    var Api = {
        trending: function () {
            var region = Lampa.Storage.get(STORAGE_REGION, 'US') || 'US';
            return unifiedRequest('trending', { region: region });
        },
        search: function (query) {
            return unifiedRequest('search', { q: query, filter: 'all' });
        },
        channel: function (id) {
            return unifiedRequest('channel', { id: id });
        },
        channelNext: function (id, nextpage) {
            return unifiedRequest('channel_next', { id: id, nextpage: nextpage }, false);
        },
        playlist: function (id) {
            return unifiedRequest('playlist', { id: id });
        },
        streams: function (id) {
            return unifiedRequest('streams', { id: id });
        }
    };

    function pad2(n) {
        n = Math.floor(n);
        return n < 10 ? '0' + n : '' + n;
    }

    function formatDuration(seconds) {
        seconds = parseInt(seconds, 10);
        if (!seconds || seconds < 0) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
        return m + ':' + pad2(s);
    }

    function formatViews(n) {
        n = parseInt(n, 10);
        if (isNaN(n) || n < 0) return '';
        if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace('.0', '') + ' млрд';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' млн';
        if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + ' тыс';
        return '' + n;
    }

    function formatDate(value) {
        if (!value) return '';
        var date;
        if (typeof value === 'number') {
            date = new Date(value > 9999999999 ? value : value * 1000);
        } else if (typeof value === 'string' && /^\d+$/.test(value)) {
            var num = parseInt(value, 10);
            date = new Date(num > 9999999999 ? num : num * 1000);
        } else if (typeof value === 'string') {
            return value;
        } else {
            return '';
        }
        if (isNaN(date.getTime())) return typeof value === 'string' ? value : '';
        var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
    }

    function extractVideoId(url) {
        if (!url) return '';
        var m = url.match(/[?&]v=([^&]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function extractChannelId(url) {
        if (!url) return '';
        var m = url.match(/\/channel\/([^?\/]+)/);
        if (m) return m[1];
        m = url.match(/\/c\/([^?\/]+)/);
        if (m) return m[1];
        m = url.match(/\/user\/([^?\/]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function extractPlaylistId(url) {
        if (!url) return '';
        var m = url.match(/[?&]list=([^&]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function absUrl(url, backend) {
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        if (url.indexOf('http') === 0) return url;
        var instances = getInstances(backend || 'piped');
        return instances[0] + url;
    }

    function bestThumb(arr) {
        if (!arr || !arr.length) return '';
        var sorted = arr.slice().sort(function (a, b) {
            return (b.width || 0) - (a.width || 0);
        });
        return sorted[0].url || '';
    }

    function noty(text) { Lampa.Noty.show(text); }

    function normalizeStreamPiped(raw) {
        return {
            kind: 'video',
            id: extractVideoId(raw.url || ''),
            title: raw.title || '',
            thumbnail: raw.thumbnail || '',
            channel: raw.uploaderName || raw.uploader || '',
            channelId: extractChannelId(raw.uploaderUrl || ''),
            duration: raw.duration || 0,
            views: raw.views || 0,
            date: raw.uploadedDate || raw.uploaded || ''
        };
    }

    function normalizeChannelPiped(raw) {
        return {
            kind: 'channel',
            id: extractChannelId(raw.url || raw.id || ''),
            title: raw.name || '',
            thumbnail: raw.thumbnail || raw.avatarUrl || '',
            subscribers: raw.subscribers || raw.subscriberCount || 0
        };
    }

    function normalizePlaylistPiped(raw) {
        return {
            kind: 'playlist',
            id: extractPlaylistId(raw.url || raw.id || ''),
            title: raw.name || raw.title || '',
            thumbnail: raw.thumbnail || raw.thumbnailUrl || '',
            channel: raw.uploaderName || raw.uploader || '',
            count: raw.videos || 0
        };
    }

    function normalizeSearchPiped(raw) {
        if (raw.type === 'channel') return normalizeChannelPiped(raw);
        if (raw.type === 'playlist') return normalizePlaylistPiped(raw);
        return normalizeStreamPiped(raw);
    }

    function normalizeStreamInvidious(raw) {
        return {
            kind: 'video',
            id: raw.videoId || '',
            title: raw.title || '',
            thumbnail: bestThumb(raw.videoThumbnails),
            channel: raw.author || '',
            channelId: raw.authorId || '',
            duration: raw.lengthSeconds || 0,
            views: raw.viewCount || 0,
            date: raw.published || raw.publishedText || ''
        };
    }

    function normalizeChannelInvidious(raw) {
        return {
            kind: 'channel',
            id: raw.authorId || raw.channelId || '',
            title: raw.author || '',
            thumbnail: bestThumb(raw.authorThumbnails),
            subscribers: raw.subCount || 0
        };
    }

    function normalizePlaylistInvidious(raw) {
        return {
            kind: 'playlist',
            id: raw.playlistId || '',
            title: raw.title || '',
            thumbnail: raw.playlistThumbnail || bestThumb(raw.videoThumbnails) || '',
            channel: raw.author || '',
            count: raw.videoCount || 0
        };
    }

    function normalizeSearchInvidious(raw) {
        if (raw.type === 'channel') return normalizeChannelInvidious(raw);
        if (raw.type === 'playlist') return normalizePlaylistInvidious(raw);
        return normalizeStreamInvidious(raw);
    }

    function normalizeItem(backend, raw, is_search) {
        if (backend === 'invidious') return is_search ? normalizeSearchInvidious(raw) : normalizeStreamInvidious(raw);
        return is_search ? normalizeSearchPiped(raw) : normalizeStreamPiped(raw);
    }

    function convertPipedStreams(data) {
        var quality_map = {};
        var video_streams = data.videoStreams || [];
        var progressive = [];
        video_streams.forEach(function (v) {
            if (v.videoOnly === false && v.url) progressive.push({ url: v.url, height: v.height || 0, label: v.quality || (v.height ? v.height + 'p' : '') });
        });
        progressive.sort(function (a, b) { return b.height - a.height; });
        progressive.forEach(function (p) {
            if (!quality_map[p.label]) quality_map[p.label] = p.url;
        });
        var related = (data.relatedStreams || []).map(function (r) { return normalizeStreamPiped(r); });
        return {
            backend: 'piped',
            title: data.title || '',
            description: data.description || '',
            uploader: data.uploader || '',
            uploaderId: extractChannelId(data.uploaderUrl || ''),
            uploaderAvatar: data.uploaderAvatar || '',
            uploaderSubscriberCount: data.uploaderSubscriberCount || 0,
            views: data.views || 0,
            likes: data.likes || 0,
            dislikes: data.dislikes || 0,
            duration: data.duration || 0,
            uploadDate: data.uploadDate || '',
            thumbnailUrl: data.thumbnailUrl || '',
            hls: data.hls || '',
            progressive: progressive,
            quality_map: quality_map,
            related: related
        };
    }

    function convertInvidiousStreams(data) {
        var quality_map = {};
        var progressive = [];
        (data.formatStreams || []).forEach(function (v) {
            if (v.url) {
                var height = 0;
                if (v.resolution) {
                    var m = v.resolution.match(/(\d+)p?/);
                    if (m) height = parseInt(m[1], 10);
                }
                progressive.push({ url: v.url, height: height, label: v.qualityLabel || (height ? height + 'p' : '') });
            }
        });
        progressive.sort(function (a, b) { return b.height - a.height; });
        progressive.forEach(function (p) {
            if (!quality_map[p.label]) quality_map[p.label] = p.url;
        });
        var related = (data.recommendedVideos || []).map(function (r) { return normalizeStreamInvidious(r); });
        return {
            backend: 'invidious',
            title: data.title || '',
            description: data.description || '',
            uploader: data.author || '',
            uploaderId: data.authorId || '',
            uploaderAvatar: bestThumb(data.authorThumbnails),
            uploaderSubscriberCount: data.subCountText || data.subCount || 0,
            views: data.viewCount || 0,
            likes: data.likeCount || 0,
            dislikes: data.dislikeCount || 0,
            duration: data.lengthSeconds || 0,
            uploadDate: data.published || '',
            thumbnailUrl: bestThumb(data.videoThumbnails),
            hls: data.hlsUrl || '',
            progressive: progressive,
            quality_map: quality_map,
            related: related
        };
    }

    function convertStreams(result) {
        if (result.backend === 'invidious') return convertInvidiousStreams(result.data);
        return convertPipedStreams(result.data);
    }

    function pickBestStreamUrl(unified) {
        var ladder = [2160, 1440, 1080, 720, 480];
        var pref = Lampa.Storage.get(STORAGE_QUALITY, 'auto') || 'auto';
        var result = { url: '', quality: unified.quality_map || {} };

        if (unified.hls) {
            result.url = unified.hls;
            return result;
        }

        var list = unified.progressive || [];
        if (!list.length) return result;

        if (pref === 'auto') {
            result.url = list[0].url;
            return result;
        }

        var pref_height = parseInt(pref, 10);
        var start_index = ladder.indexOf(pref_height);
        if (start_index === -1) start_index = 0;

        for (var i = start_index; i < ladder.length; i++) {
            var target = ladder[i];
            for (var j = 0; j < list.length; j++) {
                if (list[j].height === target) {
                    result.url = list[j].url;
                    return result;
                }
            }
        }

        result.url = list[0].url;
        return result;
    }

    function getHistory() { return jsonList(STORAGE_HISTORY, []); }

    function addHistory(item) {
        var list = getHistory().filter(function (i) { return i.id !== item.id; });
        list.unshift({ id: item.id, title: item.title, thumbnail: item.thumbnail, channel: item.ch  async function search(q) {
    var c = cache_get();
    if (c['s_' + q]) return c['s_' + q];

    var out = null;

    try {
      var r = await req(piped() + '/search?q=' + encodeURIComponent(q));
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/search?q=' + encodeURIComponent(q));
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c['s_' + q] = out;
    cache_set(c);
    return out;
  }

  async function trending() {
    var c = cache_get();
    if (c.t) return c.t;

    var out = null;

    try {
      var r = await req(piped() + '/trending');
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/trending');
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c.t = out;
    cache_set(c);
    return out;
  }

  async function video(id) {
    var c = cache_get();
    if (c['v_' + id]) return c['v_' + id];

    var out = null;

    try {
      var r = await req(piped() + '/streams/' + id);
      out = map_video_piped(r);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/videos/' + id);
        out = map_video_inv(r2);
      } catch (e) {}
    }

    c['v_' + id] = out;
    cache_set(c);
    return out;
  }

  function map_piped(v) {
    return {
      id: v.url ? (v.url.split('v=')[1] || v.id) : v.id,
      title: v.title,
      channel: v.uploaderName,
      thumbnail: v.thumbnail,
      views: v.views,
      duration: v.duration
    };
  }

  function map_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      channel: v.author,
      thumbnail: v.videoThumbnails ? v.videoThumbnails[0].url : '',
      views: v.viewCount,
      duration: v.lengthSeconds
    };
  }

  function map_video_piped(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.videoStreams || [],
      hls: v.hls,
      related: (v.relatedStreams || []).map(map_piped)
    };
  }

  function map_video_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.formatStreams || [],
      hls: v.hlsUrl,
      related: (v.recommendedVideos || []).map(map_inv)
    };
  }

  function pick(v) {
    var s = settings();
    var list = v.streams || [];
    var order = ['2160', '1440', '1080', '720', '480'];

    if (s.quality !== 'auto') {
      var f = list.find(function (x) {
        return (x.quality || '').indexOf(s.quality) !== -1;
      });
      if (f) return f.url;
    }

    for (var i = 0; i < order.length; i++) {
      var f2 = list.find(function (x) {
        return (x.quality || '').indexOf(order[i]) !== -1;
      });
      if (f2) return f2.url;
    }

    return v.hls || (list[0] && list[0].url);
  }

  function open(id) {
    video(id).then(function (v) {
      history_add({ id: v.id, title: v.title, t: Date.now() });

      Lampa.Activity.push({
        title: v.title,
        component: 'youtube_view',
        page: v
      });
    });
  }

  function grid(items) {
    var html = $('<div class="yt-grid"></div>');

    items.forEach(function (v) {
      var el = $('<div class="yt-card"></div>');
      el.append('<div class="img"><img src="' + v.thumbnail + '"></div>');
      el.append('<div class="title">' + v.title + '</div>');
      el.append('<div class="sub">' + (v.channel || '') + '</div>');
      el.on('click', function () { open(v.id); });
      html.append(el);
    });

    return html;
  }

  function trending_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'YouTube' });
      var body = $('<div></div>');

      html.find('.activity__content').append(body);

      trending().then(function (r) {
        body.append(grid(r));
      });

      return html;
    };
  }

  function search_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'Search' });
      var body = $('<div></div>');

      var input = $('<input class="inp" placeholder="Search">');

      input.on('keydown', function (e) {
        if (e.keyCode === 13) {
          search(input.val()).then(function (r) {
            body.find('.res').remove();
            body.append(grid(r).addClass('res'));
          });
        }
      });

      body.append(input);
      html.find('.activity__content').append(body);
      return html;
    };
  }

  function video_comp() {
    return function (data) {
      var v = data.page;
      var url = pick(v);

      Lampa.Player.play({
        url: url,
        title: v.title
      });

      var html = Lampa.Template.get('activity', { title: v.title });
      var body = $('<div></div>');

      body.append('<div class="desc">' + (v.description || '') + '</div>');

      (v.related || []).forEach(function (r) {
        var el = $('<div class="rel">' + r.title + '</div>');
        el.on('click', function () { open(r.id); });
        body.append(el);
      });

      html.find('.activity__content').append(body);
      return html;
    };
  }

  function settings_comp() {
    return function () {
      var s = settings();

      var html = Lampa.Template.get('activity', { title: 'Settings' });
      var body = $('<div></div>');

      var reset = $('<div class="btn">Reset cache</div>');
      reset.on('click', function () {
        cache_set({});
      });

      body.append('<div>Backend: ' + s.backend + '</div>');
      body.append('<div>Quality: ' + s.quality + '</div>');
      body.append(reset);

      html.find('.activity__content').append(body);
      return html;
    };
  }

  function init() {
    Lampa.Component.add('youtube_trending', trending_comp());
    Lampa.Component.add('youtube_search', search_comp());
    Lampa.Component.add('youtube_view', video_comp());
    Lampa.Component.add('youtube_settings', settings_comp());

    Lampa.Menu.add({
      id: 'youtube',
      title: 'YouTube',
      onSelect: function () {
        Lampa.Activity.push({
          title: 'YouTube',
          component: 'youtube_trending'
        });
      }
    });
  }

  if (window.appready) init();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type === 'ready') init();
  });

})();  }

  function subs_toggle(v) {
    var s = ls_get(STORE.subs, []);
    var i = s.findIndex(function (x) { return x.id === v.id; });
    if (i >= 0) s.splice(i, 1);
    else s.push(v);
    ls_set(STORE.subs, s);
  }

  function timeout(ms) {
    return new Promise(function (_, r) {
      setTimeout(function () { r(new Error('timeout')); }, ms);
    });
  }

  async function req(url) {
    var r = await Promise.race([fetch(url), timeout(12000)]);
    if (!r.ok) throw new Error('http');
    return r.json();
  }

  function piped() {
    var s = settings();
    return PIPED[s.piped_i] || PIPED[0];
  }

  function inv() {
    var s = settings();
    return INVIDIOUS[s.inv_i] || INVIDIOUS[0];
  }

  async function search(q) {
    var c = cache_get();
    if (c['s_' + q]) return c['s_' + q];

    var out = null;

    try {
      var r = await req(piped() + '/search?q=' + encodeURIComponent(q));
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/search?q=' + encodeURIComponent(q));
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c['s_' + q] = out;
    cache_set(c);
    return out;
  }

  async function trending() {
    var c = cache_get();
    if (c.t) return c.t;

    var out = null;

    try {
      var r = await req(piped() + '/trending');
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/trending');
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c.t = out;
    cache_set(c);
    return out;
  }

  async function video(id) {
    var c = cache_get();
    if (c['v_' + id]) return c['v_' + id];

    var out = null;

    try {
      var r = await req(piped() + '/streams/' + id);
      out = map_video_piped(r);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/videos/' + id);
        out = map_video_inv(r2);
      } catch (e) {}
    }

    c['v_' + id] = out;
    cache_set(c);
    return out;
  }

  function map_piped(v) {
    return {
      id: v.url ? (v.url.split('v=')[1] || v.id) : v.id,
      title: v.title,
      channel: v.uploaderName,
      thumbnail: v.thumbnail,
      views: v.views,
      duration: v.duration
    };
  }

  function map_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      channel: v.author,
      thumbnail: v.videoThumbnails ? v.videoThumbnails[0].url : '',
      views: v.viewCount,
      duration: v.lengthSeconds
    };
  }

  function map_video_piped(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.videoStreams || [],
      hls: v.hls,
      related: (v.relatedStreams || []).map(map_piped)
    };
  }

  function map_video_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.formatStreams || [],
      hls: v.hlsUrl,
      related: (v.recommendedVideos || []).map(map_inv)
    };
  }

  function pick(v) {
    var s = settings();
    var list = v.streams || [];
    var order = ['2160', '1440', '1080', '720', '480'];

    if (s.quality !== 'auto') {
      var f = list.find(function (x) {
        return (x.quality || '').indexOf(s.quality) !== -1;
      });
      if (f) return f.url;
    }

    for (var i = 0; i < order.length; i++) {
      var f2 = list.find(function (x) {
        return (x.quality || '').indexOf(order[i]) !== -1;
      });
      if (f2) return f2.url;
    }

    return v.hls || (list[0] && list[0].url);
  }

  function open(id) {
    video(id).then(function (v) {
      history_add({ id: v.id, title: v.title, t: Date.now() });

      Lampa.Activity.push({
        title: v.title,
        component: 'youtube_view',
        page: v
      });
    });
  }

  function grid(items) {
    var html = $('<div class="yt-grid"></div>');

    items.forEach(function (v) {
      var el = $('<div class="yt-card"></div>');
      el.append('<div class="img"><img src="' + v.thumbnail + '"></div>');
      el.append('<div class="title">' + v.title + '</div>');
      el.append('<div class="sub">' + (v.channel || '') + '</div>');
      el.on('click', function () { open(v.id); });
      html.append(el);
    });

    return html;
  }

  function trending_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'YouTube' });
      var body = $('<div></div>');

      html.find('.activity__content').append(body);

      trending().then(function (r) {
        body.append(grid(r));
      });

      return html;
    };
  }

  function search_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'Search' });
      var body = $('<div></div>');

      var input = $('<input class="inp" placeholder="Search">');

      input.on('keydown', function (e) {
        if (e.keyCode === 13) {
          search(input.val()).then(function (r) {
            body.find('.res').remove();
            body.append(grid(r).addClass('res'));
  'use strict';

    if (window.youtube_piped_plugin_installed) return;
    window.youtube_piped_plugin_installed = true;

    var DEFAULT_INSTANCES = [
        'https://pipedapi.kavin.rocks',
        'https://pipedapi.adminforge.de',
        'https://pipedapi.syncpundit.io'
    ];

    var STORAGE_INSTANCE = 'youtube_piped_instance_custom';
    var STORAGE_REGION = 'youtube_piped_region';
    var STORAGE_QUALITY = 'youtube_piped_quality';
    var STORAGE_HISTORY = 'youtube_piped_history';
    var STORAGE_FAVORITES = 'youtube_piped_favorites';
    var STORAGE_SUBSCRIPTIONS = 'youtube_piped_subscriptions';
    var STORAGE_PLAYLISTS = 'youtube_piped_playlists_local';

    var CACHE_TTL = 5 * 60 * 1000;
    var REQUEST_TIMEOUT = 12000;
    var MAX_RETRIES = 1;
    var PAGE_SIZE = 24;

    var request_cache = {};

    function nowTime() {
        return new Date().getTime();
    }

    function cacheGet(key) {
        var item = request_cache[key];
        if (!item) return null;
        if (nowTime() - item.time > CACHE_TTL) {
            delete request_cache[key];
            return null;
        }
'use strict';

  var ID = 'youtube';

  var PIPED = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.syncpundit.io'
  ];

  var INVIDIOUS = [
    'https://inv.nadeko.net'
  ];

  var STORE = {
    settings: ID + '_settings',
    cache: ID + '_cache',
    history: ID + '_history',
    fav: ID + '_fav',
    subs: ID + '_subs'
  };

  var DEFAULT = {
    backend: 'auto',
    piped_i: 0,
    inv_i: 0,
    quality: 'auto'
  };

  function ls_get(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }

  function ls_set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  function settings() {
    return Object.assign({}, DEFAULT, ls_get(STORE.settings, {}));
  }

  function set_settings(v) {
    ls_set(STORE.settings, v);
  }

  function cache_get() {
    return ls_get(STORE.cache, {});
  }

  function cache_set(v) {
    ls_set(STORE.cache, v);
  }

  function history_add(v) {
    var h = ls_get(STORE.history, []);
    h.unshift(v);
    h = h.slice(0, 300);
    ls_set(STORE.history, h);
  }

  function fav_toggle(v) {
    var f = ls_get(STORE.fav, []);
    var i = f.findIndex(function (x) { return x.id === v.id; });
    if (i >= 0) f.splice(i, 1);
    else f.push(v);
    ls_set(STORE.fav, f);
  }

  function subs_toggle(v) {
    var s = ls_get(STORE.subs, []);
    var i = s.findIndex(function (x) { return x.id === v.id; });
    if (i >= 0) s.splice(i, 1);
    else s.push(v);
    ls_set(STORE.subs, s);
  }

  function timeout(ms) {
    return new Promise(function (_, r) {
      setTimeout(function () { r(new Error('timeout')); }, ms);
    });
  }

  async function req(url) {
    var r = await Promise.race([fetch(url), timeout(12000)]);
    if (!r.ok) throw new Error('http');
    return r.json();
  }

  function piped() {
    var s = settings();
    return PIPED[s.piped_i] || PIPED[0];
  }

  function inv() {
    var s = settings();
    return INVIDIOUS[s.inv_i] || INVIDIOUS[0];
  }

  async function search(q) {
    var c = cache_get();
    if (c['s_' + q]) return c['s_' + q];

    var out = null;

    try {
      var r = await req(piped() + '/search?q=' + encodeURIComponent(q));
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/search?q=' + encodeURIComponent(q));
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c['s_' + q] = out;
    cache_set(c);
    return out;
  }

  async function trending() {
    var c = cache_get();
    if (c.t) return c.t;

    var out = null;

    try {
      var r = await req(piped() + '/trending');
      out = (r.items || r).map(map_piped);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/trending');
        out = r2.map(map_inv);
      } catch (e) {}
    }

    c.t = out;
    cache_set(c);
    return out;
  }

  async function video(id) {
    var c = cache_get();
    if (c['v_' + id]) return c['v_' + id];

    var out = null;

    try {
      var r = await req(piped() + '/streams/' + id);
      out = map_video_piped(r);
    } catch (e) {}

    if (!out) {
      try {
        var r2 = await req(inv() + '/api/v1/videos/' + id);
        out = map_video_inv(r2);
      } catch (e) {}
    }

    c['v_' + id] = out;
    cache_set(c);
    return out;
  }

  function map_piped(v) {
    return {
      id: v.url ? (v.url.split('v=')[1] || v.id) : v.id,
      title: v.title,
      channel: v.uploaderName,
      thumbnail: v.thumbnail,
      views: v.views,
      duration: v.duration
    };
  }

  function map_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      channel: v.author,
      thumbnail: v.videoThumbnails ? v.videoThumbnails[0].url : '',
      views: v.viewCount,
      duration: v.lengthSeconds
    };
  }

  function map_video_piped(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.videoStreams || [],
      hls: v.hls,
      related: (v.relatedStreams || []).map(map_piped)
    };
  }

  function map_video_inv(v) {
    return {
      id: v.videoId,
      title: v.title,
      description: v.description,
      streams: v.formatStreams || [],
      hls: v.hlsUrl,
      related: (v.recommendedVideos || []).map(map_inv)
    };
  }

  function pick(v) {
    var s = settings();
    var list = v.streams || [];
    var order = ['2160', '1440', '1080', '720', '480'];

    if (s.quality !== 'auto') {
      var f = list.find(function (x) {
        return (x.quality || '').indexOf(s.quality) !== -1;
      });
      if (f) return f.url;
    }

    for (var i = 0; i < order.length; i++) {
      var f2 = list.find(function (x) {
        return (x.quality || '').indexOf(order[i]) !== -1;
      });
      if (f2) return f2.url;
    }

    return v.hls || (list[0] && list[0].url);
  }

  function open(id) {
    video(id).then(function (v) {
      history_add({ id: v.id, title: v.title, t: Date.now() });

      Lampa.Activity.push({
        title: v.title,
        component: 'youtube_view',
        page: v
      });
    });
  }

  function grid(items) {
    var html = $('<div class="yt-grid"></div>');

    items.forEach(function (v) {
      var el = $('<div class="yt-card"></div>');
      el.append('<div class="img"><img src="' + v.thumbnail + '"></div>');
      el.append('<div class="title">' + v.title + '</div>');
      el.append('<div class="sub">' + (v.channel || '') + '</div>');
      el.on('click', function () { open(v.id); });
      html.append(el);
    });

    return html;
  }

  function trending_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'YouTube' });
      var body = $('<div></div>');

      html.find('.activity__content').append(body);

      trending().then(function (r) {
        body.append(grid(r));
      });

      return html;
    };
  }

  function search_comp() {
    return function () {
      var html = Lampa.Template.get('activity', { title: 'Search' });
      var body = $('<div></div>');

      var input = $('<input class="inp" placeholder="Search">');

      input.on('keydown', function (e) {
        if (e.keyCode === 13) {
          search(input.val()).then(function (r) {
            body.find('.res').remove();
            body.append(grid(r).addClass('res'));
          });
        }
      });

      body.append(input);
      html.find('.activity__content').append(body);
      return html;
    };
  }

  function video_comp() {
    return function (data) {
      var v = data.page;
      var url = pick(v);

      Lampa.Player.play({
        url: url,
        title: v.title
      });

      var html = Lampa.Template.get('activity', { title: v.title });
      var body = $('<div></div>');

      body.append('<div class="desc">' + (v.description || '') + '</div>');

      (v.related || []).forEach(function (r) {
        var el = $('<div class="rel">' + r.title + '</div>');
        el.on('click', function () { open(r.id); });
        body.append(el);
      });

      html.find('.activity__content').append(body);
      return html;
    };
  }

  function settings_comp() {
    return function () {
      var s = settings();

      var html = Lampa.Template.get('activity', { title: 'Settings' });
      var body = $('<div></div>');

      var reset = $('<div class="btn">Reset cache</div>');
      reset.on('click', function () {
        cache_set({});
      });

      body.append('<div>Backend: ' + s.backend + '</div>');
      body.append('<div>Quality: ' + s.quality + '</div>');
      body.append(reset);

      html.find('.activity__content').append(body);
      return html;
    };
  }

  function init() {
    Lampa.Component.add('youtube_trending', trending_comp());
    Lampa.Component.add('youtube_search', search_comp());
    Lampa.Component.add('youtube_view', video_comp());
    Lampa.Component.add('youtube_settings', settings_comp());

    Lampa.Menu.add({
      id: 'youtube',
      title: 'YouTube',
      onSelect: function () {
        Lampa.Activity.push({
          title: 'YouTube',
          component: 'youtube_trending'
        });
      }
    });
  }

  if (window.appready) init();
  else Lampa.Listener.follow('app', function (e) {
    if (e.type === 'ready') init();
  });

})()    } else {
                    reject(new Error('http_' + xhr.status));
                }
            };

            xhr.onerror = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(new Error('network_error'));
            };

            xhr.ontimeout = function () {
                if (done) return;
                done = true;
                clearTimeout(timer);
                reject(new Error('timeout'));
            };

            xhr.send();
        });
    }

    function apiRequest(path, use_cache) {
        var cache_key = path;

        if (use_cache !== false) {
            var cached = cacheGet(cache_key);
            if (cached) return Promise.resolve(cached);
        }

        var instances = getInstances();

        function tryInstance(index, retries_left) {
            if (index >= instances.length) {
                return Promise.reject(new Error('all_instances_failed'));
            }
            var base = instances[index];
            return requestOne(base, path, REQUEST_TIMEOUT).then(function (data) {
                if (use_cache !== false) cacheSet(cache_key, data);
                return data;
            }).catch(function (err) {
                if (retries_left > 0) {
                    return tryInstance(index, retries_left - 1);
                }
                return tryInstance(index + 1, MAX_RETRIES);
            });
        }

        return tryInstance(0, MAX_RETRIES);
    }

    var Api = {
        trending: function () {
            var region = Lampa.Storage.get(STORAGE_REGION, 'US') || 'US';
            return apiRequest('/trending?region=' + encodeURIComponent(region));
        },
        search: function (query, filter) {
            filter = filter || 'all';
            return apiRequest('/search?q=' + encodeURIComponent(query) + '&filter=' + encodeURIComponent(filter));
        },
        searchSuggestions: function (query) {
            return apiRequest('/suggestions?query=' + encodeURIComponent(query));
        },
        channel: function (id) {
            return apiRequest('/channel/' + encodeURIComponent(id));
        },
        channelNext: function (id, nextpage) {
            return apiRequest('/nextpage/channel/' + encodeURIComponent(id) + '?nextpage=' + encodeURIComponent(nextpage));
        },
        playlist: function (id) {
            return apiRequest('/playlists/' + encodeURIComponent(id));
        },
        streams: function (id) {
            return apiRequest('/streams/' + encodeURIComponent(id), false);
        }
    };

    function pad2(n) {
        n = Math.floor(n);
        return n < 10 ? '0' + n : '' + n;
    }

    function formatDuration(seconds) {
        seconds = parseInt(seconds, 10);
        if (!seconds || seconds < 0) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
        return m + ':' + pad2(s);
    }

    function formatViews(n) {
        n = parseInt(n, 10);
        if (isNaN(n) || n < 0) return '';
        if (n >= 1000000000) return (n / 1000000000).toFixed(1).replace('.0', '') + ' млрд';
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' млн';
        if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + ' тыс';
        return '' + n;
    }

    function formatDate(value) {
        if (!value) return '';
        var date;
        if (typeof value === 'number') {
            date = new Date(value > 9999999999 ? value : value * 1000);
        } else if (typeof value === 'string' && /^\d+$/.test(value)) {
            var num = parseInt(value, 10);
            date = new Date(num > 9999999999 ? num : num * 1000);
        } else if (typeof value === 'string') {
            return value;
        } else {
            return '';
        }
        if (isNaN(date.getTime())) return typeof value === 'string' ? value : '';
        var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
    }

    function extractVideoId(url) {
        if (!url) return '';
        var m = url.match(/[?&]v=([^&]+)/);
        if (m) return m[1];
        m = url.match(/\/watch\/([^?\/]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function extractChannelId(url) {
        if (!url) return '';
        var m = url.match(/\/channel\/([^?\/]+)/);
        if (m) return m[1];
        m = url.match(/\/c\/([^?\/]+)/);
        if (m) return m[1];
        m = url.match(/\/user\/([^?\/]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function extractPlaylistId(url) {
        if (!url) return '';
        var m = url.match(/[?&]list=([^&]+)/);
        if (m) return m[1];
        var parts = url.split('/');
        return parts[parts.length - 1];
    }

    function absUrl(url) {
        if (!url) return '';
        if (url.indexOf('//') === 0) return 'https:' + url;
        if (url.indexOf('http') === 0) return url;
        var instances = getInstances();
        return instances[0] + url;
    }

    function noty(text) {
        Lampa.Noty.show(text);
    }

    function getHistory() {
        return jsonList(STORAGE_HISTORY, []);
    }

    function addHistory(item) {
        var list = getHistory();
        list = list.filter(function (i) { return i.id !== item.id; });
        list.unshift({
            id: item.id,
            title: item.title,
            thumbnail: item.thumbnail,
            channel: item.channel,
            duration: item.duration,
            time: nowTime()
        });
        if (list.length > 200) list = list.slice(0, 200);
        jsonSave(STORAGE_HISTORY, list);
    }

    function clearHistory() {
        jsonSave(STORAGE_HISTORY, []);
    }

    function getFavorites() {
        return jsonList(STORAGE_FAVORITES, []);
    }

    function isFavorite(id) {
        var list = getFavorites();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return true;
        }
        return false;
    }

    function toggleFavorite(item) {
        var list = getFavorites();
        var exists = false;
        var result = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === item.id) {
                exists = true;
            } else {
                result.push(list[i]);
            }
        }
        if (!exists) {
            result.unshift({
                id: item.id,
                title: item.title,
                thumbnail: item.thumbnail,
                channel: item.channel,
                duration: item.duration,
                time: nowTime()
            });
        }
        jsonSave(STORAGE_FAVORITES, result);
        return !exists;
    }

    function getSubscriptions() {
        return jsonList(STORAGE_SUBSCRIPTIONS, []);
    }

    function isSubscribed(id) {
        var list = getSubscriptions();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return true;
        }
        return false;
    }

    function toggleSubscription(channel) {
        var list = getSubscriptions();
        var exists = false;
        var result = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === channel.id) {
                exists = true;
            } else {
                result.push(list[i]);
            }
        }
        if (!exists) {
            result.unshift({
                id: channel.id,
                name: channel.name,
                avatar: channel.avatar
            });
        }
        jsonSave(STORAGE_SUBSCRIPTIONS, result);
        return !exists;
    }

    function getLocalPlaylists() {
        return jsonList(STORAGE_PLAYLISTS, []);
    }

    function addLocalPlaylist(playlist) {
        var list = getLocalPlaylists();
        list = list.filter(function (i) { return i.id !== playlist.id; });
        list.unshift(playlist);
        jsonSave(STORAGE_PLAYLISTS, list);
    }

    function removeLocalPlaylist(id) {
        var list = getLocalPlaylists();
        list = list.filter(function (i) { return i.id !== id; });
        jsonSave(STORAGE_PLAYLISTS, list);
    }

    function normalizeStreamItem(raw) {
        var id = extractVideoId(raw.url || raw.videoId || '');
        return {
            kind: 'video',
            id: id,
            title: raw.title || '',
            thumbnail: raw.thumbnail || (raw.thumbnails && raw.thumbnails.length ? raw.thumbnails[raw.thumbnails.length - 1].url : ''),
            channel: raw.uploaderName || raw.uploader || '',
            channelId: extractChannelId(raw.uploaderUrl || ''),
            channelAvatar: raw.uploaderAvatar || '',
            duration: raw.duration || 0,
            views: raw.views || 0,
            date: raw.uploadedDate || raw.uploaded || raw.uploadDate || ''
        };
    }

    function normalizeChannelItem(raw) {
        var id = extractChannelId(raw.url || raw.id || '');
        return {
            kind: 'channel',
            id: id,
            title: raw.name || '',
            thumbnail: raw.thumbnail || raw.avatarUrl || '',
            subscribers: raw.subscribers || raw.subscriberCount || 0,
            description: raw.description || ''
        };
    }

    function normalizePlaylistItem(raw) {
        var id = extractPlaylistId(raw.url || raw.id || '');
        return {
            kind: 'playlist',
            id: id,
            title: raw.name || raw.title || '',
            thumbnail: raw.thumbnail || raw.thumbnailUrl || '',
            channel: raw.uploaderName || raw.uploader || '',
            count: raw.videos || 0
        };
    }

    function normalizeSearchItem(raw) {
        if (raw.type === 'channel') return normalizeChannelItem(raw);
        if (raw.type === 'playlist') return normalizePlaylistItem(raw);
        return normalizeStreamItem(raw);
    }

    var ICON_YOUTUBE = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23 7.5c0-1.9-1.4-3.4-3.2-3.6C17 3.6 12 3.6 12 3.6s-5 0-7.8.3C2.4 4.1 1 5.6 1 7.5 .8 9 .8 10.5.8 12s0 3 .2 4.5c0 1.9 1.4 3.4 3.2 3.6 2.8.3 7.8.3 7.8.3s5 0 7.8-.3c1.8-.2 3.2-1.7 3.2-3.6.2-1.5.2-3 .2-4.5s0-3-.2-4.5z" fill="#FF0000"/><path d="M9.7 15.3V8.7L15.8 12l-6.1 3.3z" fill="#fff"/></svg>';
    var ICON_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>';
    var ICON_STAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1L12 2z" fill="currentColor"/></svg>';
    var ICON_BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function injectStyles() {
        if (document.getElementById('youtube-piped-style')) return;
        var css = '' +
            '.yt-wrap{padding:0 4em 4em 4em;}' +
            '.yt-menu{display:flex;flex-direction:column;padding:2em 4em;}' +
            '.yt-menu__item{display:flex;align-items:center;padding:1em 1.5em;margin-bottom:0.6em;border-radius:0.8em;background:rgba(255,255,255,0.05);cursor:pointer;}' +
            '.yt-menu__item.focus{background:#fff;color:#000;}' +
            '.yt-menu__icon{margin-right:1em;display:flex;align-items:center;}' +
            '.yt-menu__title{font-size:1.4em;}' +
            '.yt-grid{display:flex;flex-wrap:wrap;padding:1em 0;}' +
            '.yt-card{width:21em;margin:0 1.2em 1.6em 0;cursor:pointer;border-radius:0.6em;overflow:hidden;background:rgba(255,255,255,0.04);}' +
            '.yt-card.focus{box-shadow:0 0 0 3px #fff;background:rgba(255,255,255,0.12);}' +
            '.yt-card__thumb{position:relative;width:100%;height:11.8em;background:#111 center/cover no-repeat;overflow:hidden;}' +
            '.yt-card__thumb img{width:100%;height:100%;object-fit:cover;display:block;}' +
            '.yt-card__duration{position:absolute;right:0.5em;bottom:0.5em;background:rgba(0,0,0,0.8);color:#fff;padding:0.15em 0.5em;border-radius:0.3em;font-size:0.85em;}' +
            '.yt-card__body{padding:0.8em 1em 1em 1em;}' +
            '.yt-card__title{font-size:1.05em;line-height:1.3em;max-height:2.6em;overflow:hidden;margin-bottom:0.5em;}' +
            '.yt-card__channel{font-size:0.9em;opacity:0.75;margin-bottom:0.2em;}' +
            '.yt-card__meta{font-size:0.85em;opacity:0.6;}' +
            '.yt-card.is-channel .yt-card__thumb{border-radius:50%;width:8em;height:8em;margin:1.2em auto 0 auto;}' +
            '.yt-card.is-channel{width:14em;text-align:center;}' +
            '.yt-empty{padding:3em;text-align:center;opacity:0.6;font-size:1.3em;}' +
            '.yt-loading-more{padding:2em;text-align:center;opacity:0.6;}' +
            '.yt-video{padding:2em 4em;}' +
            '.yt-video__head{display:flex;}' +
            '.yt-video__thumb{width:42em;height:23.6em;background:#111 center/cover no-repeat;border-radius:0.8em;overflow:hidden;flex-shrink:0;}' +
            '.yt-video__thumb img{width:100%;height:100%;object-fit:cover;}' +
            '.yt-video__info{padding-left:2em;flex-grow:1;}' +
            '.yt-video__title{font-size:1.8em;margin-bottom:0.6em;}' +
            '.yt-video__channel{font-size:1.2em;opacity:0.8;margin-bottom:0.4em;}' +
            '.yt-video__stats{font-size:1em;opacity:0.6;margin-bottom:1.2em;}' +
            '.yt-video__buttons{display:flex;}' +
            '.yt-btn{display:flex;align-items:center;padding:0.8em 1.6em;margin-right:1em;border-radius:0.6em;background:rgba(255,255,255,0.1);cursor:pointer;font-size:1.1em;}' +
            '.yt-btn.focus{background:#fff;color:#000;}' +
            '.yt-btn__icon{margin-right:0.6em;display:flex;}' +
            '.yt-video__description{margin-top:1.6em;font-size:1em;line-height:1.5em;opacity:0.85;white-space:pre-line;max-width:80em;}' +
            '.yt-section-title{font-size:1.4em;margin:2em 0 1em 0;opacity:0.9;}' +
            '.yt-search{padding:2em 4em;}' +
            '.yt-search__field{display:flex;align-items:center;background:rgba(255,255,255,0.08);border-radius:0.8em;padding:0.9em 1.4em;margin-bottom:1.5em;font-size:1.3em;min-height:1.4em;}' +
            '.yt-search__field.focus{box-shadow:0 0 0 3px #fff;}' +
            '.yt-search__cursor{display:inline-block;width:2px;height:1.2em;background:#fff;margin-left:2px;animation:yt-blink 1s infinite;}' +
            '@keyframes yt-blink{0%,49%{opacity:1;}50%,100%{opacity:0;}}' +
            '.yt-kb{display:flex;flex-wrap:wrap;max-width:60em;}' +
            '.yt-kb__key{min-width:3em;text-align:center;padding:0.7em 0.9em;margin:0.25em;border-radius:0.5em;background:rgba(255,255,255,0.08);cursor:pointer;font-size:1.2em;}' +
            '.yt-kb__key.focus{background:#fff;color:#000;}' +
            '.yt-kb__key.wide{min-width:8em;}' +
            '.yt-channels-toolbar{display:flex;justify-content:flex-end;padding:0 4em;margin-bottom:1em;}' +
            '.yt-channel-card{display:flex;align-items:center;width:100%;padding:1em 1.5em;margin-bottom:0.6em;border-radius:0.8em;background:rgba(255,255,255,0.05);cursor:pointer;}' +
            '.yt-channel-card.focus{background:#fff;color:#000;}' +
            '.yt-channel-card__avatar{width:3.2em;height:3.2em;border-radius:50%;background:#111 center/cover no-repeat;margin-right:1.2em;flex-shrink:0;}' +
            '.yt-channel-card__avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;}' +
            '.yt-channel-card__name{font-size:1.2em;}' +
            '';
        var style = document.createElement('style');
        style.id = 'youtube-piped-style';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    function buildVideoCard(data) {
        var card = $('<div class="yt-card selector"></div>');
        var thumb = $('<div class="yt-card__thumb"></div>');
        if (data.thumbnail) thumb.append('<img src="' + absUrl(data.thumbnail) + '" />');
        if (data.duration) thumb.append('<div class="yt-card__duration">' + formatDuration(data.duration) + '</div>');
        var body = $('<div class="yt-card__body"></div>');
        body.append('<div class="yt-card__title">' + Lampa.Utils.escapeHtml(data.title) + '</div>');
        if (data.channel) body.append('<div class="yt-card__channel">' + Lampa.Utils.escapeHtml(data.channel) + '</div>');
        var meta_parts = [];
        if (data.views) meta_parts.push(formatViews(data.views) + ' просмотров');
        if (data.date) meta_parts.push(formatDate(data.date));
        if (meta_parts.length) body.append('<div class="yt-card__meta">' + meta_parts.join(' • ') + '</div>');
        card.append(thumb).append(body);
        card.data('item', data);
        return card;
    }

    function buildChannelCard(data) {
        var card = $('<div class="yt-card is-channel selector"></div>');
        var thumb = $('<div class="yt-card__thumb"></div>');
        if (data.thumbnail) thumb.append('<img src="' + absUrl(data.thumbnail) + '" />');
        var body = $('<div class="yt-card__body"></div>');
        body.append('<div class="yt-card__title">' + Lampa.Utils.escapeHtml(data.title) + '</div>');
        if (data.subscribers) body.append('<div class="yt-card__meta">' + formatViews(data.subscribers) + ' подписчиков</div>');
        card.append(thumb).append(body);
        card.data('item', data);
        return card;
    }

    function buildPlaylistCard(data) {
        var card = $('<div class="yt-card selector"></div>');
        var thumb = $('<div class="yt-card__thumb"></div>');
        if (data.thumbnail) thumb.append('<img src="' + absUrl(data.thumbnail) + '" />');
        var body = $('<div class="yt-card__body"></div>');
        body.append('<div class="yt-card__title">' + Lampa.Utils.escapeHtml(data.title) + '</div>');
        if (data.channel) body.append('<div class="yt-card__channel">' + Lampa.Utils.escapeHtml(data.channel) + '</div>');
        if (data.count) body.append('<div class="yt-card__meta">' + data.count + ' видео</div>');
        card.append(thumb).append(body);
        card.data('item', data);
        return card;
    }

    function buildCardForItem(item) {
        if (item.kind === 'channel') return buildChannelCard(item);
        if (item.kind === 'playlist') return buildPlaylistCard(item);
        return buildVideoCard(item);
    }

    function openVideo(item) {
        Lampa.Activity.push({
            url: '',
            title: item.title,
            component: 'youtube_piped_video',
            video_id: item.id,
            page: 1
        });
    }

    function openChannel(item) {
        Lampa.Activity.push({
            url: '',
            title: item.title,
            component: 'youtube_piped_list',
            source: 'channel',
            channel_id: item.id,
            page: 1
        });
    }

    function openPlaylist(item) {
        Lampa.Activity.push({
            url: '',
            title: item.title,
            component: 'youtube_piped_list',
            source: 'playlist',
            playlist_id: item.id,
            page: 1
        });
    }

    function openItem(item) {
        if (item.kind === 'channel') openChannel(item);
        else if (item.kind === 'playlist') openPlaylist(item);
        else openVideo(item);
    }

    function pickBestStreamUrl(streams) {
        var quality_pref = Lampa.Storage.get(STORAGE_QUALITY, 'auto') || 'auto';
        var result = { url: '', quality: {}, is_hls: false };

        if (streams.hls) {
            result.url = streams.hls;
            result.is_hls = true;
        }

        var progressive = [];
        var video_streams = streams.videoStreams || [];
        for (var i = 0; i < video_streams.length; i++) {
            var v = video_streams[i];
            if (v.videoOnly === false && v.url) {
                progressive.push(v);
            }
        }

        progressive.sort(function (a, b) {
            return (b.height || 0) - (a.height || 0);
        });

        var quality_map = {};
        for (var j = 0; j < progressive.length; j++) {
            var p = progressive[j];
            var label = p.quality || (p.height ? p.height + 'p' : 'auto');
            if (!quality_map[label]) quality_map[label] = p.url;
        }

        result.quality = quality_map;

        if (!result.url) {
            if (quality_pref !== 'auto') {
                var wanted = quality_pref + 'p';
                if (quality_map[wanted]) {
                    result.url = quality_map[wanted];
                }
            }
            if (!result.url && progressive.length) {
                result.url = progressive[0].url;
            }
        }

        if (!result.url && video_streams.length) {
            result.url = video_streams[0].url;
        }

        return result;
    }

    function playVideo(item, streams) {
        var picked = pickBestStreamUrl(streams);

        if (!picked.url) {
            noty('Не удалось получить поток для воспроизведения');
            return;
        }

        addHistory({
            id: item.id,
            title: streams.title || item.title,
            thumbnail: item.thumbnail,
            channel: streams.uploader || item.channel,
            duration: streams.duration
        });

        var playlist_item = {
            title: streams.title || item.title,
            url: picked.url,
            quality: picked.quality
        };

        if (picked.is_hls) {
            playlist_item.url = picked.url;
        }

        Lampa.Player.play({
            title: streams.title || item.title,
            url: picked.url,
            quality: picked.quality,
            playlist: [playlist_item]
        });

        Lampa.Player.playlist([playlist_item]);
    }

    function ScrollList() {
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 320 });
        return scroll;
    }

    function MainMenuComponent(object) {
        var html = $('<div class="yt-wrap"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var menu = $('<div class="yt-menu"></div>');

        var items = [
            { title: 'Популярное', source: 'trending' },
            { title: 'В тренде', source: 'trending' },
            { title: 'Поиск', source: 'search' },
            { title: 'Подписки', source: 'subscriptions' },
            { title: 'История', source: 'history' },
            { title: 'Избранное', source: 'favorites' },
            { title: 'Каналы', source: 'channels' },
            { title: 'Плейлисты', source: 'playlists' }
        ];

        this.create = function () {
            return this.render();
        };

        this.render = function (js) {
            return js ? html : html[0];
        };

        this.build = function () {
            items.forEach(function (entry) {
                var el = $('<div class="yt-menu__item selector"><div class="yt-menu__icon">' + ICON_YOUTUBE + '</div><div class="yt-menu__title">' + entry.title + '</div></div>');
                el.on('hover:enter', function () {
                    if (entry.source === 'search') {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Поиск YouTube',
                            component: 'youtube_piped_search',
                            page: 1
                        });
                    } else if (entry.source === 'channels') {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Каналы',
                            component: 'youtube_piped_channels',
                            page: 1
                        });
                    } else if (entry.source === 'playlists') {
                        Lampa.Activity.push({
                            url: '',
                            title: 'Плейлисты',
                            component: 'youtube_piped_playlists',
                            page: 1
                        });
                    } else {
                        Lampa.Activity.push({
                            url: '',
                            title: entry.title,
                            component: 'youtube_piped_list',
                            source: entry.source,
                            page: 1
                        });
                    }
                });
                el.on('hover:focus', function (e) {
                    scroll.update($(e.target).hasClass('yt-menu__item') ? $(e.target) : el, true);
                });
                menu.append(el);
            });
            scroll.append(menu);
            html.append(scroll.render());
        };

        this.start = function () {
            if (!menu.children().length) this.build();
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(menu.find('.selector').eq(0)[0], scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () { Lampa.Controller.move('down'); },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

    function VideoListComponent(object) {
        var html = $('<div></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 320 });
        var grid = $('<div class="yt-grid"></div>');
        var loading_more = false;
        var finished = false;
        var nextpage = null;
        var loaded_once = false;

        this.create = function () {
            return this.render();
        };

        this.render = function (js) {
            return js ? html : html[0];
        };

        function showEmpty(text) {
            grid.html('<div class="yt-empty">' + text + '</div>');
        }

        function appendItems(list) {
            list.forEach(function (item) {
                if (!item.id) return;
                var card = buildCardForItem(item);
                card.on('hover:enter', function () {
                    openItem(item);
                });
                card.on('hover:focus', function () {
                    scroll.update(card, true);
                });
                card.on('hover:long', function () {
                    showItemMenu(item);
                });
                grid.append(card);
            });
            Lampa.Controller.collectionSet(scroll.render());
        }

        function showItemMenu(item) {
            var buttons = [];
            if (item.kind === 'video') {
                buttons.push({ title: isFavorite(item.id) ? 'Убрать из избранного' : 'Добавить в избранное', action: 'favorite' });
            }
            buttons.push({ title: 'Открыть', action: 'open' });
            Lampa.Select.show({
                title: item.title,
                items: buttons,
                onSelect: function (selected) {
                    if (selected.action === 'favorite') {
                        toggleFavorite(item);
                        noty('Готово');
                    } else {
                        openItem(item);
                    }
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        function loadInitial() {
            Lampa.Loading.start(function () {
                Lampa.Loading.stop();
            });

            var source = object.source;
            var promise;

            if (source === 'trending') {
                promise = Api.trending().then(function (data) {
                    return (data || []).map(normalizeStreamItem);
                });
            } else if (source === 'history') {
                promise = Promise.resolve(getHistory().map(function (h) {
                    return { kind: 'video', id: h.id, title: h.title, thumbnail: h.thumbnail, channel: h.channel, duration: h.duration };
                }));
                finished = true;
            } else if (source === 'favorites') {
                promise = Promise.resolve(getFavorites().map(function (h) {
                    return { kind: 'video', id: h.id, title: h.title, thumbnail: h.thumbnail, channel: h.channel, duration: h.duration };
                }));
                finished = true;
            } else if (source === 'subscriptions') {
                var subs = getSubscriptions();
                if (!subs.length) {
                    promise = Promise.resolve([]);
                    finished = true;
                } else {
                    promise = Promise.all(subs.map(function (s) {
                        return Api.channel(s.id).catch(function () { return null; });
                    })).then(function (results) {
                        var all = [];
                        results.forEach(function (data) {
                            if (!data) return;
                            var related = data.relatedStreams || [];
                            related.forEach(function (r) { all.push(normalizeStreamItem(r)); });
                        });
                        all.sort(function (a, b) {
                            var da = (typeof a.date === 'number') ? a.date : 0;
                            var db = (typeof b.date === 'number') ? b.date : 0;
                            return db - da;
                        });
                        return all;
                    });
                    finished = true;
                }
            } else if (source === 'channel') {
                promise = Api.channel(object.channel_id).then(function (data) {
                    nextpage = data.nextpage || null;
                    var related = data.relatedStreams || [];
                    return related.map(normalizeStreamItem);
                });
            } else if (source === 'playlist') {
                promise = Api.playlist(object.playlist_id).then(function (data) {
                    var related = data.relatedStreams || data.videos || [];
                    if (typeof related === 'number') related = [];
                    return related.map(normalizeStreamItem);
                });
                finished = true;
            } else if (source === 'search') {
                promise = Api.search(object.query, object.filter || 'all').then(function (data) {
                    var items = data && data.items ? data.items : (data || []);
                    nextpage = data && data.nextpage ? data.nextpage : null;
                    return items.map(normalizeSearchItem);
                });
            } else {
                promise = Promise.resolve([]);
                finished = true;
            }

            promise.then(function (list) {
                Lampa.Loading.stop();
                loaded_once = true;
                if (!list.length) {
                    showEmpty('Ничего не найдено');
                    return;
                }
                appendItems(list);
                if (!nextpage) finished = true;
                Lampa.Controller.toggle('content');
            }).catch(function (err) {
                Lampa.Loading.stop();
                showEmpty('Ошибка загрузки. Проверьте инстанс Piped в настройках.');
                noty('Ошибка загрузки YouTube: ' + (err && err.message ? err.message : 'unknown'));
            });
        }

        function loadMore() {
            if (loading_more || finished) return;
            if (object.source !== 'channel') return;
            loading_more = true;

            Api.channelNext(object.channel_id, nextpage).then(function (data) {
                loading_more = false;
                nextpage = data.nextpage || null;
                var related = data.relatedStreams || [];
                var list = related.map(normalizeStreamItem);
                if (!list.length || !nextpage) finished = true;
                appendItems(list);
            }).catch(function () {
                loading_more = false;
                finished = true;
            });
        }

        this.start = function () {
            if (!loaded_once) loadInitial();

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    var first = grid.find('.selector').eq(0)[0];
                    if (first) Lampa.Controller.collectionFocus(first, scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () {
                    Lampa.Controller.move('down');
                },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');

            scroll.onEnd = function () {
                loadMore();
            };
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };

        scroll.append(grid);
        html.append('<div class="yt-wrap"></div>');
        html.find('.yt-wrap').append(scroll.render());
    }

    function VideoComponent(object) {
        var html = $('<div class="yt-video"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 320 });
        var body = $('<div></div>');
        var related_grid = $('<div class="yt-grid"></div>');
        var loaded = false;
        var stream_data = null;

        this.create = function () {
            return this.render();
        };

        this.render = function (js) {
            return js ? html : html[0];
        };

        function buildView(data) {
            var item = { id: object.video_id, title: data.title, thumbnail: data.thumbnailUrl };

            var head = $('<div class="yt-video__head"></div>');
            var thumb = $('<div class="yt-video__thumb"></div>');
            if (data.thumbnailUrl) thumb.append('<img src="' + absUrl(data.thumbnailUrl) + '" />');

            var info = $('<div class="yt-video__info"></div>');
            info.append('<div class="yt-video__title">' + Lampa.Utils.escapeHtml(data.title) + '</div>');
            info.append('<div class="yt-video__channel">' + Lampa.Utils.escapeHtml(data.uploader || '') + '</div>');

            var stats = [];
            if (data.views) stats.push(formatViews(data.views) + ' просмотров');
            if (data.likes) stats.push(formatViews(data.likes) + ' лайков');
            if (data.uploadDate) stats.push(formatDate(data.uploadDate));
            if (data.duration) stats.push(formatDuration(data.duration));
            info.append('<div class="yt-video__stats">' + stats.join(' • ') + '</div>');

            var buttons = $('<div class="yt-video__buttons"></div>');

            var play_btn = $('<div class="yt-btn selector"><div class="yt-btn__icon">' + ICON_PLAY + '</div><div>Смотреть</div></div>');
            play_btn.on('hover:enter', function () {
                playVideo({ id: object.video_id, title: data.title, thumbnail: data.thumbnailUrl, channel: data.uploader }, data);
            });
            play_btn.on('hover:focus', function () { scroll.update(play_btn, true); });
            buttons.append(play_btn);

            var fav_btn = $('<div class="yt-btn selector"><div class="yt-btn__icon">' + ICON_STAR + '</div><div>' + (isFavorite(object.video_id) ? 'В избранном' : 'В избранное') + '</div></div>');
            fav_btn.on('hover:enter', function () {
                var added = toggleFavorite({ id: object.video_id, title: data.title, thumbnail: data.thumbnailUrl, channel: data.uploader, duration: data.duration });
                fav_btn.find('div:last').text(added ? 'В избранном' : 'В избранное');
                noty(added ? 'Добавлено в избранное' : 'Удалено из избранного');
            });
            fav_btn.on('hover:focus', function () { scroll.update(fav_btn, true); });
            buttons.append(fav_btn);

            if (data.uploaderUrl) {
                var channel_id = extractChannelId(data.uploaderUrl);
                var chan_btn = $('<div class="yt-btn selector"><div>Канал</div></div>');
                chan_btn.on('hover:enter', function () {
                    openChannel({ kind: 'channel', id: channel_id, title: data.uploader });
                });
                chan_btn.on('hover:focus', function () { scroll.update(chan_btn, true); });
                buttons.append(chan_btn);

                var sub_btn = $('<div class="yt-btn selector"><div>' + (isSubscribed(channel_id) ? 'Вы подписаны' : 'Подписаться') + '</div></div>');
                sub_btn.on('hover:enter', function () {
                    var added = toggleSubscription({ id: channel_id, name: data.uploader, avatar: data.uploaderAvatar });
                    sub_btn.find('div').text(added ? 'Вы подписаны' : 'Подписаться');
                    noty(added ? 'Подписка оформлена' : 'Подписка отменена');
                });
                sub_btn.on('hover:focus', function () { scroll.update(sub_btn, true); });
                buttons.append(sub_btn);
            }

            info.append(buttons);
            head.append(thumb).append(info);
            body.append(head);

            if (data.description) {
                body.append('<div class="yt-video__description">' + Lampa.Utils.escapeHtml(data.description) + '</div>');
            }

            var related = data.relatedStreams || [];
            if (related.length) {
                body.append('<div class="yt-section-title">Похожие видео</div>');
                related.forEach(function (raw) {
                    var rel_item = normalizeStreamItem(raw);
                    if (!rel_item.id) return;
                    var card = buildCardForItem(rel_item);
                    card.on('hover:enter', function () { openItem(rel_item); });
                    card.on('hover:focus', function () { scroll.update(card, true); });
                    related_grid.append(card);
                });
                body.append(related_grid);
            }

            scroll.append(body);
            html.append(scroll.render());
        }

        function loadData() {
            Lampa.Loading.start(function () { Lampa.Loading.stop(); });
            Api.streams(object.video_id).then(function (data) {
                Lampa.Loading.stop();
                stream_data = data;
                buildView(data);
                loaded = true;
                Lampa.Controller.toggle('content');
            }).catch(function (err) {
                Lampa.Loading.stop();
                html.append('<div class="yt-empty">Не удалось загрузить видео. Проверьте инстанс Piped в настройках.</div>');
                noty('Ошибка загрузки видео: ' + (err && err.message ? err.message : 'unknown'));
            });
        }

        this.start = function () {
            if (!loaded) loadData();

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    var first = html.find('.selector').eq(0)[0];
                    if (first) Lampa.Controller.collectionFocus(first, scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () { Lampa.Controller.move('down'); },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

    function ChannelsComponent(object) {
        var html = $('<div class="yt-wrap"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var list_wrap = $('<div></div>');

        this.create = function () { return this.render(); };
        this.render = function (js) { return js ? html : html[0]; };

        function renderList() {
            list_wrap.empty();
            var subs = getSubscriptions();
            if (!subs.length) {
                list_wrap.append('<div class="yt-empty">Список подписок пуст. Подпишитесь на канал из карточки видео.</div>');
                return;
            }
            subs.forEach(function (channel) {
                var el = $('<div class="yt-channel-card selector"><div class="yt-channel-card__avatar">' + (channel.avatar ? '<img src="' + absUrl(channel.avatar) + '"/>' : '') + '</div><div class="yt-channel-card__name">' + Lampa.Utils.escapeHtml(channel.name || channel.id) + '</div></div>');
                el.on('hover:enter', function () {
                    openChannel({ kind: 'channel', id: channel.id, title: channel.name });
                });
                el.on('hover:focus', function () { scroll.update(el, true); });
                el.on('hover:long', function () {
                    Lampa.Select.show({
                        title: channel.name,
                        items: [{ title: 'Открыть канал', action: 'open' }, { title: 'Отписаться', action: 'remove' }],
                        onSelect: function (selected) {
                            if (selected.action === 'remove') {
                                toggleSubscription(channel);
                                renderList();
                                Lampa.Controller.toggle('content');
                            } else {
                                openChannel({ kind: 'channel', id: channel.id, title: channel.name });
                            }
                        },
                        onBack: function () { Lampa.Controller.toggle('content'); }
                    });
                });
                list_wrap.append(el);
            });
        }

        this.start = function () {
            renderList();
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    var first = list_wrap.find('.selector').eq(0)[0];
                    if (first) Lampa.Controller.collectionFocus(first, scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () { Lampa.Controller.move('down'); },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };

        scroll.append(list_wrap);
        html.append(scroll.render());
    }

    function PlaylistsComponent(object) {
        var html = $('<div class="yt-wrap"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var toolbar = $('<div class="yt-channels-toolbar"></div>');
        var grid = $('<div class="yt-grid"></div>');

        this.create = function () { return this.render(); };
        this.render = function (js) { return js ? html : html[0]; };

        function renderList() {
            grid.empty();
            var list = getLocalPlaylists();
            if (!list.length) {
                grid.append('<div class="yt-empty">Плейлисты не добавлены. Найдите плейлист через поиск и добавьте его сюда.</div>');
                return;
            }
            list.forEach(function (pl) {
                var card = buildPlaylistCard({ kind: 'playlist', id: pl.id, title: pl.title, thumbnail: pl.thumbnail, channel: pl.channel, count: pl.count });
                card.on('hover:enter', function () { openPlaylist(pl); });
                card.on('hover:focus', function () { scroll.update(card, true); });
                card.on('hover:long', function () {
                    Lampa.Select.show({
                        title: pl.title,
                        items: [{ title: 'Открыть', action: 'open' }, { title: 'Удалить', action: 'remove' }],
                        onSelect: function (selected) {
                            if (selected.action === 'remove') {
                                removeLocalPlaylist(pl.id);
                                renderList();
                                Lampa.Controller.toggle('content');
                            } else {
                                openPlaylist(pl);
                            }
                        },
                        onBack: function () { Lampa.Controller.toggle('content'); }
                    });
                });
                grid.append(card);
            });
        }

        this.start = function () {
            renderList();
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    var first = grid.find('.selector').eq(0)[0];
                    if (first) Lampa.Controller.collectionFocus(first, scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () { Lampa.Controller.move('down'); },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };

        scroll.append(grid);
        html.append(scroll.render());
    }

    var KEYBOARD_ROWS = [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
        ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
        ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю'],
        ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
        ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
        ['z', 'x', 'c', 'v', 'b', 'n', 'm']
    ];

    function SearchComponent(object) {
        var html = $('<div class="yt-search"></div>');
        var scroll = new Lampa.Scroll({ mask: true, over: true, step: 320 });
        var body = $('<div></div>');
        var field = $('<div class="yt-search__field selector"><span class="yt-search__text"></span><span class="yt-search__cursor"></span></div>');
        var keyboard = $('<div class="yt-kb"></div>');
        var results = $('<div class="yt-grid"></div>');
        var query = object.query || '';

        function updateField() {
            field.find('.yt-search__text').text(query);
        }

        function buildKeyboard() {
            KEYBOARD_ROWS.forEach(function (row) {
                var row_wrap = $('<div style="display:flex;width:100%;"></div>');
                row.forEach(function (ch) {
                    var key = $('<div class="yt-kb__key selector">' + ch + '</div>');
                    key.on('hover:enter', function () {
                        query += ch;
                        updateField();
                    });
                    key.on('hover:focus', function () { scroll.update(key, true); });
                    row_wrap.append(key);
                });
                keyboard.append(row_wrap);
            });

            var control_row = $('<div style="display:flex;width:100%;"></div>');

            var space_key = $('<div class="yt-kb__key wide selector">пробел</div>');
            space_key.on('hover:enter', function () { query += ' '; updateField(); });
            space_key.on('hover:focus', function () { scroll.update(space_key, true); });
            control_row.append(space_key);

            var back_key = $('<div class="yt-kb__key wide selector">⌫ Стереть</div>');
            back_key.on('hover:enter', function () { query = query.slice(0, -1); updateField(); });
            back_key.on('hover:focus', function () { scroll.update(back_key, true); });
            control_row.append(back_key);

            var clear_key = $('<div class="yt-kb__key wide selector">Очистить</div>');
            clear_key.on('hover:enter', function () { query = ''; updateField(); });
            clear_key.on('hover:focus', function () { scroll.update(clear_key, true); });
            control_row.append(clear_key);

            var submit_key = $('<div class="yt-kb__key wide selector">Найти</div>');
            submit_key.on('hover:enter', function () { doSearch(); });
            submit_key.on('hover:focus', function () { scroll.update(submit_key, true); });
            control_row.append(submit_key);

            keyboard.append(control_row);
        }

        function doSearch() {
            if (!query.trim()) {
                noty('Введите запрос для поиска');
                return;
            }
            results.html('<div class="yt-empty">Загрузка...</div>');
            Api.search(query.trim(), 'all').then(function (data) {
                var items = data && data.items ? data.items : (data || []);
                results.empty();
                if (!items.length) {
                    results.append('<div class="yt-empty">Ничего не найдено</div>');
                    Lampa.Controller.toggle('content');
                    return;
                }
                items.forEach(function (raw) {
                    var item = normalizeSearchItem(raw);
                    if (!item.id) return;
                    var card = buildCardForItem(item);
                    card.on('hover:enter', function () {
                        if (item.kind === 'playlist') {
                            Lampa.Select.show({
                                title: item.title,
                                items: [{ title: 'Открыть', action: 'open' }, { title: 'Добавить в плейлисты', action: 'save' }],
                                onSelect: function (selected) {
                                    if (selected.action === 'save') {
                                        addLocalPlaylist({ id: item.id, title: item.title, thumbnail: item.thumbnail, channel: item.channel, count: item.count });
                                        noty('Плейлист добавлен');
                                    } else {
                                        openItem(item);
                                    }
                                },
                                onBack: function () { Lampa.Controller.toggle('content'); }
                            });
                        } else {
                            openItem(item);
                        }
                    });
                    card.on('hover:focus', function () { scroll.update(card, true); });
                    results.append(card);
                });
                Lampa.Controller.collectionSet(scroll.render());
                Lampa.Controller.toggle('content');
            }).catch(function (err) {
                results.html('<div class="yt-empty">Ошибка поиска. Проверьте инстанс Piped в настройках.</div>');
                noty('Ошибка поиска: ' + (err && err.message ? err.message : 'unknown'));
            });
        }

        this.create = function () { return this.render(); };
        this.render = function (js) { return js ? html : html[0]; };

        this.start = function () {
            if (!body.children().length) {
                updateField();
                buildKeyboard();
                body.append(field).append(keyboard).append('<div class="yt-section-title">Результаты</div>').append(results);
                scroll.append(body);
                html.append(scroll.render());

                field.on('hover:enter', function () { doSearch(); });
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(field[0], scroll.render());
                },
                up: function () { Lampa.Controller.move('up'); },
                down: function () { Lampa.Controller.move('down'); },
                left: function () { Lampa.Controller.move('left'); },
                right: function () { Lampa.Controller.move('right'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function () {};
        this.stop = function () {};
        this.destroy = function () {
            scroll.destroy();
            html.remove();
        };
    }

    function addSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'youtube_piped',
            icon: ICON_YOUTUBE,
            name: 'YouTube'
        });

        Lampa.SettingsApi.addParam({
            component: 'youtube_piped',
            param: {
                name: STORAGE_INSTANCE,
                type: 'input',
                placeholder: 'https://pipedapi.kavin.rocks',
                values: false,
                default: ''
            },
            field: {
                name: 'Piped Instance',
                description: 'Адрес рабочего инстанса Piped API. Если пусто — используются встроенные сервера.'
            },
            onChange: function (value) {
                var v = (value && value.value !== undefined) ? value.value : value;
                Lampa.Storage.set(STORAGE_INSTANCE, ('' + v).trim());
                clearCache();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'youtube_piped',
            param: {
                name: STORAGE_REGION,
                type: 'input',
                placeholder: 'US',
                default: 'US'
            },
            field: {
                name: 'Регион трендов',
                description: 'Код региона для раздела В тренде / Популярное (US, RU, DE, GB...)'
            },
            onChange: function (value) {
                var v = (value && value.value !== undefined) ? value.value : value;
                Lampa.Storage.set(STORAGE_REGION, ('' + v).trim() || 'US');
                clearCache();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'youtube_piped',
            param: {
                name: STORAGE_QUALITY,
                type: 'select',
                values: {
                    'auto': 'Авто (макс. доступное)',
                    '2160': '4K (2160p)',
                    '1440': '1440p',
                    '1080': '1080p',
                    '720': '720p',
                    '480': '480p'
                },
                default: 'auto'
            },
            field: {
                name: 'Предпочитаемое качество',
                description: 'Желаемое качество видео при воспроизведении'
            },
            onChange: function (value) {
                var v = (value && value.value !== undefined) ? value.value : value;
                Lampa.Storage.set(STORAGE_QUALITY, v);
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'youtube_piped',
            param: {
                name: 'youtube_piped_clear_history',
                type: 'button'
            },
            field: {
                name: 'Очистить историю просмотров',
                description: 'Удалить всю сохранённую историю YouTube'
            },
            onChange: function () {
                clearHistory();
                noty('История очищена');
            }
        });
    }

    function addMenuButton() {
        var menu_item = $('<li class="menu__item selector" data-action="youtube_piped"><div class="menu__ico">' + ICON_YOUTUBE + '</div><div class="menu__text">YouTube</div></li>');

        menu_item.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'YouTube',
                component: 'youtube_piped_main',
                page: 1
            });
        });

        var target = $('.menu .menu__list').eq(0);
        if (target.length) target.append(menu_item);
    }

    function registerComponents() {
        Lampa.Component.add('youtube_piped_main', MainMenuComponent);
        Lampa.Component.add('youtube_piped_list', VideoListComponent);
        Lampa.Component.add('youtube_piped_video', VideoComponent);
        Lampa.Component.add('youtube_piped_channels', ChannelsComponent);
        Lampa.Component.add('youtube_piped_playlists', PlaylistsComponent);
        Lampa.Component.add('youtube_piped_search', SearchComponent);
    }

    function startPlugin() {
        injectStyles();
        registerComponents();
        addSettings();

        if (window.appready) {
            addMenuButton();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') addMenuButton();
            });
        }
    }

    if (window.Lampa && Lampa.Component) {
        startPlugin();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            startPlugin();
        });
    }
})();
