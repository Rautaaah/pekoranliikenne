import { useRouter } from "next/dist/client/router";
import React from "react";
import Theme2016 from "../../../components/theme2016";
import UserFriends from "../../../components/userFriends";
import UserFriendsStore from "../../../components/userFriends/stores/userFriendsStore";

const UserFriendsPage = props => {
  const router = useRouter();
  const { userId } = router.query;
  const effectiveUserId = userId || props.userId || null;
  return <Theme2016>
    <UserFriendsStore.Provider>
      <UserFriends userId={effectiveUserId}></UserFriends>
    </UserFriendsStore.Provider>
  </Theme2016>
}

export default UserFriendsPage;

export async function getServerSideProps(ctx) {
  return {
    props: {
      userId: ctx?.params?.userId || null,
    },
  };
}
