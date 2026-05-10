import {createContainer} from "unstated-next";
import {useEffect, useState} from "react";
import {searchUsers} from "../../../services/users";
import {multiGetPresence} from "../../../services/presence";
import getFlag from "../../../lib/getFlag";

const SearchUsersStore = createContainer(() => {
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(false);
  const [presence, setPresence] = useState({});

  useEffect(() => {
    if (!keyword && !getFlag('searchUsersAllowNullKeyword', false)) {
      setLocked(false);
      return;
    }
    setLocked(true);
    searchUsers({keyword, limit: 12, offset: 0}).then(d => {
      setData(d || { UserSearchResults: [] });
      const users = d?.UserSearchResults || d?.userSearchResults || [];
      const ids = users.map(v => v.UserId || v.userId);
      if (!ids.length) {
        setPresence({});
        return;
      }
      multiGetPresence({userIds: ids}).then(presenceData => {
        let obj = {}
        for (const id of presenceData) {
          obj[id.userId] = id;
        }
        setPresence(obj);
      }).catch(() => {
        setPresence({});
      });
    }).catch(() => {
      setData({ UserSearchResults: [] });
      setPresence({});
    }).finally(() => {
      setLocked(false);
    })
  }, [keyword]);

  return {
    keyword,
    setKeyword,

    data,
    setData,

    presence,

    locked,
    setLocked,
  };
});

export default SearchUsersStore;
