import React, { useEffect } from "react";
import { createUseStyles } from "react-jss";
import { getInfo, getRoles, getUserGroups } from "../../services/groups";
import AuthenticationStore from "../../stores/authentication";
import AdSkyscraper from "../ad/adSkyscraper";
import Currency from "./components/currency";
import GroupControls from "./components/groupControls";
import GroupPage from "./components/groupPage";
import SideBar from "./components/sidebar";
import GroupPageStore from "./stores/groupPageStore";
import MyGroupsStore from "./stores/myGroupsStore";

const useStyles = createUseStyles({
  groupsContainer: {
    background: 'var(--white-color)',
    padding: '10px 12px',
    width: '100%',
    '@media (max-width: 991px)': {
      padding: '8px',
    },
  }
})

const MyGroups = props => {
  const s = useStyles();

  const store = MyGroupsStore.useContainer();
  const auth = AuthenticationStore.useContainer();
  const groupPageStore = GroupPageStore.useContainer();

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    getUserGroups({
      userId: auth.userId,
    }).then(store.setGroups);
  }, [auth.userId, auth.isAuthenticated]);

  useEffect(() => {
    // if (!store.groups) return;
    if (props.id) {
      groupPageStore.setGroupId(parseInt(props.id, 10));
      getInfo({
        groupId: props.id,
      }).then(groupPageStore.setInfo);
      // check if exists
      let inCache = store.groups && store.groups.find(v => v.group.id == props.id);
      if (inCache) {
        groupPageStore.setRank(inCache.role);
      } else {
        getRoles({
          groupId: props.id
        }).then((d) => {
          let guest = d.find(v => v.rank === 0);
          groupPageStore.setRank(guest);
        })
      }
    } else if (store.groups) {
      groupPageStore.setGroupId(store.groups[0]?.group.id);
      groupPageStore.setInfo(store.groups[0]?.group);
      groupPageStore.setRank(store.groups[0]?.role);
    }
  }, [store.groups, props.id]);

  const groupCol = auth.isAuthenticated ? 'col-12 col-lg-7 ps-lg-0' : 'col-12 col-lg-8 mx-lg-auto';

  return <div className={'container ' + s.groupsContainer}>
    <div className='row'>
      {auth.isAuthenticated ?
        <div className='col-12 col-lg-3 mb-3 mb-lg-0'>
          <SideBar />
        </div> : null}
      <div className={groupCol}>
        <div className='row'>
          <div className='col-12'>
            {groupPageStore.groupId && <GroupPage/>}
          </div>
        </div>
      </div>
      <div className='col-12 col-lg-2 ps-lg-0 mt-3 mt-lg-0'>
        {groupPageStore.info && groupPageStore.info.owner && groupPageStore.info.owner.userId === auth.userId && <Currency groupId={groupPageStore.groupId}/>}
        <div className='mt-2'>
          <GroupControls/>
        </div>
        <div className='mt-2 d-none d-lg-block'>
          <AdSkyscraper context='GroupDetailsPage'/>
        </div>
      </div>
    </div>
  </div>
}

export default MyGroups
