import searchUsersStore from "../stores/searchGroupsStore";
import {createUseStyles} from "react-jss";
import GroupIcon from "../../groupIcon";
import dayjs from "../../../lib/dayjs";
import Link from "../../link";

const useStyles = createUseStyles({
  textRight: {
    textAlign: 'right',
  },
  status: {
    fontSize: '80px',
    position: 'relative',
    top: '-65px',
    display: 'block',
    height: 0,
  },
  groupname: {
    marginLeft: '20px',
  },
  groupRow: {
    color: 'inherit',
    borderTop: '1px solid var(--text-color-quinary)',
    paddingTop: '20px',
    paddingBottom: '20px',
    '&:hover': {
      background: '#e1e1e1',
      cursor: 'pointer',
    },
  },
  colorNormal: {
    color: 'rgb(20,20,20)',
  },
});

const GroupsRow = props => {
  const store = searchUsersStore.useContainer();
  const s = useStyles();
  const results = store.data?.data || store.data?.Data || [];

  if (!store.data)
    return null;

  return <div className='row'>
    <div className='col-12'>
      {
        results.length ? results.map(v => {
          const groupId = v.id || v.Id;
          const groupName = v.name || v.Name;
          const memberCount = v.memberCount || v.MemberCount || 0;

          return <div className={s.groupRow} key={groupId}>
               <Link href={`/My/Groups.aspx?gid=${groupId}`} >
                 <a>
                   <div className='row'>
                     <div className='col-6 col-md-2 col-lg-1'>
                       <GroupIcon id={groupId} />
                     </div>
                     <div className='col-6 col-md-7 col-lg-8'>
                       <p><span className={s.groupname}>{groupName}</span> </p>
                     </div>
                     <div className='col-12 col-md-3 col-lg-3'>
                       <p className={`${s.textRight} ${s.colorNormal}`}>{memberCount >= 1000 ? (memberCount / 1000).toFixed(1) + 'k+' : memberCount} Members</p>
                     </div>
                   </div>
                 </a>
               </Link>
          </div>
        }) : <div className='row'>
          <div className='col-12'>
            <p className='mt-4'>No results for "{store.keyword}"</p>
          </div>
        </div>
      }
    </div>
  </div>
}

export default GroupsRow;
