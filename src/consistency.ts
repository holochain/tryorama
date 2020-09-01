import { Player } from "./player"

const getStates = async (instance_id, players: Array<Player>, hosted_players: Array<HostedPlayer>): Promise<any> => {
	let all_players = players.concat(hosted_players)
	return Promise.all(all_players.map(player => player.stateDump(instance_id)))
}

const getPublicEntryHashes = async (instance_id, players: Array<Player>, hosted_players: Array<HostedPlayer>): Promise<any> => {
	var hashes = new Set()
	// using state-dump to get chain data for now, this needs to be a real admin call so we can
	// distinguish private entries
	const states = await getStates(instance_id, players, hosted_players)
	for (const state of states) {
		for (const [element, chain_header] of state["source_chain"]) {
			if (element["header"]["entry_type"] != 'CapTokenGrant') {
				hashes.add(element["header"]["entry_address"])
			}
		}
	}
	return Array.from(hashes)
}

function areHeadersEqualSets(metas) {
	const superSet = {};
	for (const i of metas[0]["headers"]) {
		const e = i + typeof i;
		superSet[e] = 1;
	}
	const playersCount = metas.length
	for (var j = 1; j < playersCount; j++) {
		for (const i of metas[j]["headers"]) {
			const e = i + typeof i;
			if (!superSet[e]) {
				return false;
			}
			superSet[e] += 1;
		}
	}

	for (let e in superSet) {
		if (superSet[e] != playersCount) {
			return false;
		}
	}

	return true;
}

export const getMetas = async (instance_id, players: Array<Player>, hosted_players: Array<HostedPlayer>, hash: string): Promise<any> => {
	let all_players = players.concat(hosted_players)
	return Promise.all(all_palyers.map(player => player.getMeta(instance_id, hash)))
}

// checks to see if players are all holding all the same data
export const isConsistent = async (instance_id, players: Array<Player>, hosted_players: Array<HostedPlayer>): Promise<Boolean> => {
	const hashes = await getPublicEntryHashes(instance_id, players, hosted_players)
	for (const hash of hashes) {
		const metas = await getMetas(instance_id, players, hosted_players, hash)
		if (!areHeadersEqualSets(metas)) {
			return false
		}
	}
	return true
}
