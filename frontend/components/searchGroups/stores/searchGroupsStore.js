import {createContainer} from "unstated-next";
import {useEffect, useState} from "react";
import {searchGroups} from "../../../services/groups";
import getFlag from "../../../lib/getFlag";

const SearchGroupsStore = createContainer(() => {
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!keyword && !getFlag('searchUsersAllowNullKeyword', false)) {
      setLocked(false);
      return;
    }
    setLocked(true);
    searchGroups({keyword, limit: 12, offset: 0}).then(d => {
      setData(d || { data: [] });
    }).catch(() => {
      setData({ data: [] });
    }).finally(() => {
      setLocked(false);
    })
  }, [keyword]);

  return {
    keyword,
    setKeyword,

    data,
    setData,

    locked,
    setLocked,
  };
});

export default SearchGroupsStore;
