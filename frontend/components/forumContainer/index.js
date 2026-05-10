import UserAdvertisement from "../userAdvertisement";
import {createUseStyles} from "react-jss";

const useStyles = createUseStyles({
  forumColumn: {
  },
  forumContainer: {
    width: '100%',
  },
});

const ForumContainer = props => {
  const s = useStyles();
  return <div className={'container ' + s.forumContainer}>
    <div className='row'>
      <div className='col-12 col-lg-10'>
        <UserAdvertisement type={1} />
        <div className='mt-4'>
          <div className='bg-white-2 pt-2 pb-2'>
            {props.children}
          </div>
        </div>
      </div>
      <div className='col-12 col-lg-2 mt-3 mt-lg-0'>
        <UserAdvertisement type={2} />
      </div>
    </div>
  </div>
}

export default ForumContainer;
