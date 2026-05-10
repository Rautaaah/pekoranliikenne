import { useRouter } from "next/router";
import UserInventory from "../../../components/userInventory";
import { getUserInfo } from "../../../services/users";
import Head from "next/head";

const UserInventoryPage = ({ username, userId }) => {
  const router = useRouter();
  const ogTitle = username ? `${username}'s Inventory` : "Zekoro";
  const ogUrl = userId ? `https://zekoro.org/users/${userId}/inventory` : '';
  const headshotUrl = userId ? `https://zekoro.org/thumbs/avatar-headshot.ashx?userId=${userId}` : '';

  return (
    <>
      {username && (
        <Head>
          <title>{ogTitle} - Zekoro</title>
          <meta property="og:title" content={ogTitle} />
          <meta property="og:url" content={ogUrl} />
          <meta property="og:type" content="profile" />
          <meta property="og:description" content={`View ${username}'s inventory`} />
          <meta property="og:image" content={headshotUrl} />
          <meta property="og:image:secure_url" content={headshotUrl} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="150" />
          <meta property="og:image:height" content="150" />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={`View ${username}'s inventory`} />
          <meta name="twitter:image" content={headshotUrl} />
          <meta property="og:site_name" content="Zekoro" />
          <meta name="theme-color" content="#1188ff" />
        </Head>
      )}
      <UserInventory userId={userId} mode='Inventory' />
    </>
  );
}

export async function getServerSideProps(context) {
  const { userId } = context.query;
  try {
    const info = await getUserInfo({ userId });
    const username = info.name || null; 
    return {
      props: {
        username,
        userId
      }
    };
  } catch (error) {
    console.error("Error fetching user info in inventory.js");
    return {
      props: {
        username: null, 
        userId
      }
    };
  }
}

export default UserInventoryPage;
