import {useRouter} from "next/dist/client/router";
import GroupAdmin from "../../components/groupAdmin";

const MyGroupAdmin = props => {
  const router = useRouter();
  const queryGid = router?.query?.gid;
  const resolvedGroupId = parseInt(queryGid || props?.groupId || "0", 10);

  if (!resolvedGroupId || Number.isNaN(resolvedGroupId)) {
    return <div className='p-4 text-white'>Invalid group id.</div>;
  }

  return <GroupAdmin groupId={resolvedGroupId} />
}

export async function getServerSideProps(context) {
  const rawGid = context?.query?.gid;
  const groupId = parseInt(rawGid || "0", 10);
  return {
    props: {
      groupId: Number.isNaN(groupId) ? 0 : groupId,
    }
  };
}

export default MyGroupAdmin;
