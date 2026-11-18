import {handleRelay,RelayRoom} from './lib/relay.mjs';
export {RelayRoom};

export default {
  async fetch(request, env) {
    return env.RELAY_ROOM.get(env.RELAY_ROOM.idFromName('global')).fetch(request);
  }
};
