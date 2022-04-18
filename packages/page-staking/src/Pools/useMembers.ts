// Copyright 2017-2022 @polkadot/app-staking authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Changes } from '@polkadot/react-hooks/useEventChanges';
import type { bool, Option, StorageKey, u32, u128 } from '@polkadot/types';
import type { AccountId32, EventRecord } from '@polkadot/types/interfaces';
import type { PalletNominationPoolsDelegator } from '@polkadot/types/lookup';
import type { MembersMap, MembersMapEntry } from './types';

import { useEffect, useState } from 'react';

import { createNamedHook, useApi, useCall, useEventChanges, useMapEntries } from '@polkadot/react-hooks';

const OPT_ENTRIES = {
  transform: (entries: [StorageKey<[AccountId32]>, Option<PalletNominationPoolsDelegator>][]): MembersMap =>
    entries.reduce((all: MembersMap, [{ args: [accountId] }, optInfo]) => {
      if (optInfo.isSome) {
        const info = optInfo.unwrap();
        const poolId = info.poolId.toString();

        if (!all[poolId]) {
          all[poolId] = [];
        }

        all[poolId].push({ accountId, info });
      }

      return all;
    }, {})
};

const OPT_MULTI = {
  transform: ([[ids], values]: [[AccountId32[]], Option<PalletNominationPoolsDelegator>[]]): MembersMapEntry[] =>
    ids
      .filter((_, i) => values[i].isSome)
      .map((accountId, i) => ({ accountId, info: values[i].unwrap() })),
  withParamsTransform: true
};

function filterEvents (records: EventRecord[]): Changes<AccountId32> {
  const added: AccountId32[] = [];
  const removed: AccountId32[] = [];

  records.forEach(({ event: { data, method } }): void => {
    if (method === 'Bonded') {
      const [accountId,,, joined] = data as unknown as [AccountId32, u32, u128, bool];

      if (joined.isTrue) {
        added.push(accountId);
      }
    }
  });

  return { added, removed };
}

function interleave (prev: MembersMap, additions: MembersMapEntry[]): MembersMap {
  return additions.reduce<MembersMap>((all, entry) => {
    const poolId = entry.info.poolId.toString();
    const arr: MembersMapEntry[] = [];

    if (all[poolId]) {
      all[poolId].forEach((prev): void => {
        if (!prev.accountId.eq(entry.accountId)) {
          arr.push(prev);
        }
      });
    }

    arr.push(entry);

    all[poolId] = arr;

    return all;
  }, { ...prev });
}

function useMembersImpl (): MembersMap | undefined {
  const { api } = useApi();
  const [membersMap, setMembersMap] = useState<MembersMap | undefined>();
  const queryMap = useMapEntries(api.query.nominationPools.delegators, OPT_ENTRIES);
  const ids = useEventChanges([
    api.events.nominationPools.Bonded
  ], filterEvents, []);
  const additions = useCall(ids.length !== 0 && api.query.nominationPools.delegators.multi, [ids], OPT_MULTI);

  // initial entries
  useEffect((): void => {
    queryMap && setMembersMap(queryMap);
  }, [queryMap]);

  // additions via events
  useEffect((): void => {
    additions && setMembersMap((prev) => prev && interleave(prev, additions));
  }, [additions]);

  return membersMap;
}

export default createNamedHook('useMembers', useMembersImpl);