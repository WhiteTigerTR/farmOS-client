import farmOS from 'farmos';
import makeLog from '@/utils/makeLog';

const farm = () => {
  const host = localStorage.getItem('host');
  const user = localStorage.getItem('username');
  const password = localStorage.getItem('password');
  return farmOS(host, user, password);
};

export default {
  actions: {
    updateAreas({ commit }) {
      return farm().area.get().then((res) => {
        // If a successful response is received, delete and replace all areas
        commit('deleteAllAreas');
        const areas = res.list.map(({ tid, name, geofield }) => ({ tid, name, geofield })); // eslint-disable-line camelcase, max-len
        commit('addAreas', areas);
      }).catch((err) => { throw err; });
    },
    updateAssets({ commit }) {
      return farm().asset.get().then((res) => {
        // If a successful response is received, delete and replace all assets
        commit('deleteAllAssets');
        const assets = res.list.map(({ id, name, type }) => ({ id, name, type }));
        commit('addAssets', assets);
      }).catch((err) => { throw err; });
    },
    updateUnits({ commit }) {
      // Return units only.
      return farm().term.get('farm_quantity_units').then((res) => {
        commit('deleteAllUnits');
        const units = res.list.map(({ tid, name }) => ({ tid, name }));
        commit('addUnits', units);
      }).catch((err) => { throw err; });
    },
    updateCategories({ commit }) {
      // Return categories only.
      return farm().term.get('farm_log_categories').then((res) => {
        commit('deleteAllCategories');
        const cats = res.list.map(({ tid, name }) => ({ tid, name }));
        commit('addCategories', cats);
      }).catch((err) => { throw err; });
    },
    updateEquipment({ commit }) {
      function getEquip(assets) {
        const equip = [];
        assets.forEach((asset) => {
          if (asset.type === 'equipment') {
            equip.push(asset);
          }
        });
        return equip;
      }
      return farm().asset.get().then((res) => {
        commit('deleteAllEquipment');
        const assets = res.list.map(({ id, name, type }) => ({ id, name, type })); // eslint-disable-line camelcase, max-len
        const equipment = getEquip(assets);
        commit('addEquipment', equipment);
      }).catch((err) => { throw err; });
    },

    // SEND LOGS TO SERVER (step 2 of sync)
    sendLogs({ commit, rootState }, payload) {
      // Update logs in the database and local store after send completes
      function handleSyncResponse(response, index) {
        commit('updateLogs', {
          indices: [index],
          mapper(log) {
            return makeLog.create({
              ...log,
              id: response.id,
              wasPushedToServer: true,
              isReadyToSync: false,
              remoteUri: response.uri,
            });
          },
        });
      }

      function handleSyncError(error, index) {
        // Do something with a TypeError object (mostly likely no connection)
        if (typeof error === 'object' && error.status === undefined) {
          const errorPayload = {
            message: `Unable to sync "${rootState.farm.logs[index].name.data}" because the network is currently unavailable. Please try syncing again later.`,
            errorCode: error.statusText,
            level: 'warning',
            show: true,
          };
          commit('logError', errorPayload);
        } else if (error.status === 401 || error.status === 403) {
          // Reroute authentication or authorization errors to login page
          payload.router.push('/login');
        } else {
          // handle some other type of runtime error (if possible)
          error.text().then((errorText) => {
            const errorPayload = {
              message: `${error.status} error while syncing "${rootState.farm.logs[index].name.data}": ${errorText}`,
              errorCode: error.statusText,
              level: 'warning',
              show: true,
            };
            commit('logError', errorPayload);
          });
        }
        commit('updateLogs', {
          indices: [index],
          mapper(log) {
            return makeLog.create({
              ...log,
              isReadyToSync: false,
            });
          },
        });
      }

      // format images for the payload
      function processImages(image) {
        if (Array.isArray(image)) {
          const imgArray = [];
          image.forEach((img) => {
            // Files begin with 'data:'.  Retain file strings, turn ref strings into objects
            if (img.charAt(0) === 'd') {
              imgArray.push(img);
            } else {
              imgArray.push({ fid: img });
            }
          });
          return imgArray;
        }
        return image;
      }

      // Send records to the server, unless the user isn't logged in
      if (localStorage.getItem('token')) {
        payload.indices.map((index) => { // eslint-disable-line consistent-return, array-callback-return, max-len
          // Either send or post logs, depending on whether they originated on the server
          // Logs originating on the server possess an ID field; others do not.
          const newLog = makeLog.toServer(rootState.farm.logs[index]);
          newLog.images = processImages(newLog.images);
          newLog.done = newLog.done ? 1 : 0;
          // I need to check wasPushedToServer, which is not in logFactory Server
          const synced = rootState.farm.logs[index].wasPushedToServer;
          if (!synced) {
            return farm().log.send(newLog, localStorage.getItem('token')) // eslint-disable-line no-use-before-define, max-len
              .then(res => handleSyncResponse(res, index))
              .catch(err => handleSyncError(err, index));
          }
        });
      } else {
        payload.router.push('/login');
      }
    },

    // GET LOGS FROM SERVER (step 1 of sync)
    getServerLogs({ commit, rootState }) {
      const syncDate = localStorage.getItem('syncDate');
      const allLogs = rootState.farm.logs;
      return farm().log.get(rootState.shell.settings.logImportFilters)
        .then((res) => {
          res.list.forEach((log) => {
            const checkStatus = checkLog(log, allLogs, syncDate); // eslint-disable-line no-use-before-define, max-len
            if (checkStatus.serverChange) {
              const mergedLog = processLog(log, checkStatus, syncDate); // eslint-disable-line no-use-before-define, max-len
              commit('updateLogFromServer', {
                index: checkStatus.storeIndex,
                log: mergedLog,
              });
            }
            if (checkStatus.localId === null) {
              const mergedLog = processLog(log, checkStatus, syncDate); // eslint-disable-line no-use-before-define, max-len
              commit('addLogFromServer', mergedLog);
            }
          });
        })
        .catch(err => err);
      // Errors are handled in index.js
    },
  },
};

function checkLog(serverLog, allLogs, syncDate) {
  // The localLog will be passed as logStatus.log if localChange checks true
  const logStatus = {
    localId: null,
    storeIndex: null,
    localChange: true,
    serverChange: false,
    log: null,
  };
  allLogs.forEach((localLog, index) => {
    if (localLog.id) {
      /*
        If a local log has an id field, see if it is the same as the server log.
        In this case set lotStatus.localId and .storeIndex
        Also check whethe the log is unsynced (wasPushedToServer true)
      */
      if (localLog.id === serverLog.id) {
        logStatus.localId = localLog.local_id;
        logStatus.storeIndex = index;
        if (JSON.parse(localLog.wasPushedToServer) === true) {
          logStatus.localChange = false;
        } else {
          logStatus.log = localLog;
        }
        if (+serverLog.changed > +syncDate) {
          logStatus.serverChange = true;
        }
      }
    }
  });
  return logStatus;
}

// Process each log on its way from the server to the logFactory
function processLog(log, checkStatus, syncDate) {
  /*
  If the log is not present locally, return the server version.
  If the log is present locally, but has not been changed since the last sync,
  return the new version from the server (with local_id)
  If the log is present locally and has been changed, check log.changed from the server
  against the changed property of each log attribute
   - If any attribute has been changed more recently than the server log, keep it
   - Otherwise take changes from the server
  */
  if (checkStatus.localId === null) {
    return makeLog.fromServer({
      ...log,
      wasPushedToServer: true,
      // Trying to make isReady..
      isReadyToSync: false,
      done: (parseInt(log.done, 10) === 1),
    });
  }
  if (!checkStatus.localChange && checkStatus.serverChange) {
    // Update the log with all data from the server
    return makeLog.fromServer({
      ...log,
      wasPushedToServer: true,
      isReadyToSync: false,
      local_id: checkStatus.localId,
      done: (parseInt(log.done, 10) === 1),
    });
  }
  /*
  Replace properties of the local log that have not been modified since
  the last sync with data from the server.
  For properties that have been completed since the sync date,
  Present choice to retain either the log or the server version
  */
  const storeLog = checkStatus.log;
  const servLogBuilder = {};
  const locLogBuilder = {};
  const serverConflicts = {};

  /*
  We compare changed dates for local log properties against the date of last sync.
  madeFromServer is used as a source
  for building the merged log, to keep formatting consistent
  */
  const madeFromServer = makeLog.fromServer(log);
  Object.keys(storeLog).forEach((key) => {
    if (storeLog[key].changed && storeLog[key].changed !== null) {
      // TODO: Would it be better to compare against madeFromServer.changed
      if (+storeLog[key].changed < +syncDate) {
        servLogBuilder[key] = madeFromServer[key];
      } else {
        locLogBuilder[key] = storeLog[key];
        serverConflicts[key] = madeFromServer[key];
      }
    }
  });
  return makeLog.toStore({
    ...locLogBuilder,
    ...servLogBuilder,
    wasPushedToServer: false,
    local_id: checkStatus.localId,
    id: log.id,
    done: {
      changed: Math.floor(Date.now() / 1000),
      data: (+log.done === 1),
    },
    isReadyToSync: true,
  });
}
