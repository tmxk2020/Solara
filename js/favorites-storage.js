/**
 * Solara 收藏夹存储模块
 * 云端同步实现，通过 /starlist.txt 端点实现跨设备收藏同步
 */

(function () {
    "use strict";

    // API 端点
    var STARLIST_ENDPOINT = "/starlist.txt";

    // 本地缓存状态
    var favoritesState = {
        songs: [],
        currentIndex: 0,
        playMode: "list", // "list", "single", "random"
        playbackTime: 0,
        isSynced: false
    };

    // 回调函数列表
    var changeCallbacks = [];

    /**
     * 从云端加载收藏列表
     * @returns {Promise<Array>} 收藏歌曲列表
     */
    async function loadFromCloud() {
        try {
            var response = await fetch(STARLIST_ENDPOINT + "?format=json");
            if (!response.ok) {
                throw new Error("Request failed with status " + response.status);
            }
            var data = await response.json();
            if (data.success && Array.isArray(data.songs)) {
                favoritesState.songs = data.songs;
                favoritesState.isSynced = true;
                console.log("[收藏夹存储] 从云端加载了", favoritesState.songs.length, "首歌曲");
                notifyChange("loaded");
                return favoritesState.songs;
            }
            return [];
        } catch (e) {
            console.error("[收藏夹存储] 从云端加载失败:", e);
            favoritesState.isSynced = false;
            return [];
        }
    }

    /**
     * 保存收藏列表到云端
     * @returns {Promise<boolean>} 是否保存成功
     */
    async function saveToCloud() {
        try {
            var response = await fetch(STARLIST_ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ songs: favoritesState.songs })
            });
            if (!response.ok) {
                throw new Error("Save failed with status " + response.status);
            }
            favoritesState.isSynced = true;
            console.log("[收藏夹存储] 已同步", favoritesState.songs.length, "首歌曲到云端");
            notifyChange("saved");
            return true;
        } catch (e) {
            console.error("[收藏夹存储] 保存到云端失败:", e);
            favoritesState.isSynced = false;
            return false;
        }
    }

    /**
     * 添加单首歌曲到收藏
     * @param {Object} song - 歌曲对象
     * @returns {Promise<boolean>} 是否添加成功
     */
    async function addSong(song) {
        if (!song || typeof song !== "object") {
            console.warn("[收藏夹存储] 无效的歌曲对象");
            return false;
        }

        // 检查是否已存在
        var exists = favoritesState.songs.some(function (s) {
            return s.id === song.id && s.source === song.source;
        });

        if (exists) {
            console.log("[收藏夹存储] 歌曲已存在:", song.name);
            return false;
        }

        try {
            var response = await fetch(STARLIST_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ song: song })
            });
            if (!response.ok) {
                throw new Error("Add failed with status " + response.status);
            }

            favoritesState.songs.push(song);
            console.log("[收藏夹存储] 已添加:", song.name);
            notifyChange("added", song);
            return true;
        } catch (e) {
            console.error("[收藏夹存储] 添加收藏失败:", e);
            return false;
        }
    }

    /**
     * 从收藏中移除歌曲
     * @param {string|number} songId - 歌曲 ID
     * @param {string} source - 歌曲来源
     * @returns {Promise<boolean>} 是否移除成功
     */
    async function removeSong(songId, source) {
        var songIndex = -1;
        for (var i = 0; i < favoritesState.songs.length; i++) {
            if (favoritesState.songs[i].id === songId && favoritesState.songs[i].source === source) {
                songIndex = i;
                break;
            }
        }

        if (songIndex === -1) {
            console.log("[收藏夹存储] 未找到要移除的歌曲:", songId);
            return false;
        }

        try {
            var response = await fetch(STARLIST_ENDPOINT, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ songId: songId, source: source })
            });
            if (!response.ok) {
                var errorData = await response.json().catch(function() { return {}; });
                throw new Error(errorData.message || "Delete failed with status " + response.status);
            }

            favoritesState.songs.splice(songIndex, 1);

            // 修正当前索引
            if (favoritesState.currentIndex >= favoritesState.songs.length) {
                favoritesState.currentIndex = Math.max(0, favoritesState.songs.length - 1);
            }

            console.log("[收藏夹存储] 已移除歌曲:", songId);
            notifyChange("removed", { id: songId, source: source });
            return true;
        } catch (e) {
            console.error("[收藏夹存储] 移除收藏失败:", e);
            return false;
        }
    }

    /**
     * 切换歌曲的收藏状态
     * @param {Object} song - 歌曲对象
     * @returns {Promise<boolean>} true 表示已收藏，false 表示已取消收藏
     */
    async function toggleSong(song) {
        if (!song) return false;

        var exists = favoritesState.songs.some(function (s) {
            return s.id === song.id && s.source === song.source;
        });

        if (exists) {
            await removeSong(song.id, song.source);
            return false;
        } else {
            return await addSong(song);
        }
    }

    /**
     * 检查歌曲是否已收藏（同步检查）
     * @param {string|number} songId - 歌曲 ID
     * @param {string} source - 歌曲来源
     * @returns {boolean}
     */
    function isFavorite(songId, source) {
        return favoritesState.songs.some(function (s) {
            return s.id === songId && s.source === source;
        });
    }

    /**
     * 异步检查歌曲是否已收藏（先从云端同步）
     * @param {string|number} songId - 歌曲 ID
     * @param {string} source - 歌曲来源
     * @returns {Promise<boolean>}
     */
    async function isFavoriteAsync(songId, source) {
        await loadFromCloud();
        return isFavorite(songId, source);
    }

    /**
     * 批量添加歌曲到收藏
     * @param {Array} songs - 歌曲数组
     * @returns {Promise<number>} 成功添加的数量
     */
    async function addSongsBatch(songs) {
        if (!Array.isArray(songs)) {
            console.warn("[收藏夹存储] 无效的歌曲数组");
            return 0;
        }

        // 过滤已存在的歌曲
        var newSongs = songs.filter(function (song) {
            return song && typeof song === "object" && !isFavorite(song.id, song.source);
        });

        if (newSongs.length === 0) {
            console.log("[收藏夹存储] 所有歌曲已存在，无需添加");
            return 0;
        }

        try {
            var response = await fetch(STARLIST_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ songs: newSongs })
            });
            if (!response.ok) {
                throw new Error("Batch add failed with status " + response.status);
            }

            favoritesState.songs.push(...newSongs);
            console.log("[收藏夹存储] 批量添加:", newSongs.length, "首歌曲");
            notifyChange("batchAdded", newSongs);
            return newSongs.length;
        } catch (e) {
            console.error("[收藏夹存储] 批量添加失败:", e);
            return 0;
        }
    }

    /**
     * 清空所有收藏
     * @returns {Promise<boolean>} 是否清空成功
     */
    async function clearAll() {
        try {
            var response = await fetch(STARLIST_ENDPOINT, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ songs: [] })
            });
            if (!response.ok) {
                throw new Error("Clear failed with status " + response.status);
            }

            favoritesState.songs = [];
            favoritesState.currentIndex = 0;
            favoritesState.playbackTime = 0;
            console.log("[收藏夹存储] 已清空所有收藏");
            notifyChange("cleared");
            return true;
        } catch (e) {
            console.error("[收藏夹存储] 清空收藏失败:", e);
            return false;
        }
    }

    /**
     * 导出收藏数据为 JSON 字符串
     * @returns {string} JSON 字符串
     */
    function exportToJson() {
        var exportData = {
            version: 1,
            exportDate: new Date().toISOString(),
            songs: favoritesState.songs,
            settings: {
                playMode: favoritesState.playMode
            }
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 从 JSON 字符串导入收藏数据
     * @param {string} jsonString - JSON 字符串
     * @returns {Promise<boolean>} 是否导入成功
     */
    async function importFromJson(jsonString) {
        try {
            var data = JSON.parse(jsonString);

            if (!data || !Array.isArray(data.songs)) {
                console.error("[收藏夹存储] 无效的导入数据格式");
                return false;
            }

            // 使用批量添加
            var addedCount = await addSongsBatch(data.songs);

            if (data.settings && data.settings.playMode) {
                favoritesState.playMode = data.settings.playMode;
            }

            console.log("[收藏夹存储] 已导入", addedCount, "首新歌曲");
            return addedCount > 0;
        } catch (e) {
            console.error("[收藏夹存储] JSON 解析失败:", e);
            return false;
        }
    }

    /**
     * 通知变更
     */
    function notifyChange(type, data) {
        for (var i = 0; i < changeCallbacks.length; i++) {
            try {
                changeCallbacks[i](type, data);
            } catch (e) {
                console.error("[收藏夹存储] 回调执行失败:", e);
            }
        }
    }

    // Getter 方法
    function getSongs() {
        return favoritesState.songs.slice();
    }

    function getSongAt(index) {
        if (index >= 0 && index < favoritesState.songs.length) {
            return favoritesState.songs[index];
        }
        return null;
    }

    function getCurrentIndex() {
        return favoritesState.currentIndex;
    }

    function setCurrentIndex(index) {
        if (index >= 0 && index < favoritesState.songs.length) {
            favoritesState.currentIndex = index;
        }
    }

    function getNextIndex() {
        var next = favoritesState.currentIndex + 1;
        if (next >= favoritesState.songs.length) {
            return favoritesState.songs.length > 0 ? 0 : -1;
        }
        return next;
    }

    function getPrevIndex() {
        var prev = favoritesState.currentIndex - 1;
        if (prev < 0) {
            return favoritesState.songs.length > 0 ? favoritesState.songs.length - 1 : -1;
        }
        return prev;
    }

    function getCount() {
        return favoritesState.songs.length;
    }

    function getPlayMode() {
        return favoritesState.playMode;
    }

    function setPlayMode(mode) {
        if (["list", "single", "random"].indexOf(mode) !== -1) {
            favoritesState.playMode = mode;
        }
    }

    function getPlaybackTime() {
        return favoritesState.playbackTime;
    }

    function setPlaybackTime(time) {
        if (typeof time === "number" && time >= 0) {
            favoritesState.playbackTime = time;
        }
    }

    /**
     * 注册变更回调
     * @param {Function} callback - 回调函数 (type, data) => void
     */
    function onChange(callback) {
        if (typeof callback === "function") {
            changeCallbacks.push(callback);
        }
    }

    /**
     * 刷新同步
     * @returns {Promise<Array>} 最新的收藏列表
     */
    async function sync() {
        return await loadFromCloud();
    }

    /**
     * 获取同步状态
     * @returns {boolean}
     */
    function isSynced() {
        return favoritesState.isSynced;
    }

    // 公开 API
    window.SolaraFavoritesStorage = {
        // 初始化（从云端加载）
        init: loadFromCloud,

        // 基本操作
        add: addSong,
        remove: removeSong,
        toggle: toggleSong,
        isFavorite: isFavorite,
        isFavoriteAsync: isFavoriteAsync,
        addBatch: addSongsBatch,
        clearAll: clearAll,

        // 获取数据
        getSongs: getSongs,
        getSongAt: getSongAt,
        getCount: getCount,
        getCurrentIndex: getCurrentIndex,
        setCurrentIndex: setCurrentIndex,
        getNextIndex: getNextIndex,
        getPrevIndex: getPrevIndex,

        // 播放设置
        getPlayMode: getPlayMode,
        setPlayMode: setPlayMode,
        getPlaybackTime: getPlaybackTime,
        setPlaybackTime: setPlaybackTime,

        // 导入导出
        exportToJson: exportToJson,
        importFromJson: importFromJson,

        // 同步
        sync: sync,
        isSynced: isSynced,
        onChange: onChange,

        // 直接访问内部状态（谨慎使用）
        getState: function () {
            return {
                songs: favoritesState.songs.slice(),
                currentIndex: favoritesState.currentIndex,
                playMode: favoritesState.playMode,
                playbackTime: favoritesState.playbackTime,
                isSynced: favoritesState.isSynced
            };
        }
    };

    // 自动从云端加载
    loadFromCloud();

    console.log("[收藏夹存储] 模块已加载，云端同步模式");

})();