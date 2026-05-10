import { useRouter } from "next/dist/client/router";
import React from "react";
import Head from "next/head";
import MyGroups from "../../components/myGroups";
import GroupPageStore from "../../components/myGroups/stores/groupPageStore";
import MyGroupsStore from "../../components/myGroups/stores/myGroupsStore";
import { getInfo } from "../../services/groups";

const getGroupIconUrl = (groupId, imageVersion) => {
  if (!groupId) return "";
  return `https://zekoro.org/apisite/thumbnails/v1/groups/icons?groupIds=${groupId}&size=420x420&format=Png&cacheBust=${imageVersion}`;
}

const MyGroupsPage = ({ groupId: initialGroupId, groupName, description, imageVersion }) => {
  const router = useRouter();
  const activeGroupId = router.query['gid'] || initialGroupId;
  const ogTitle = groupName || "Zekoro Group";
  const ogDescription = description || "Join the Zekoro community.";
  const ogImage = getGroupIconUrl(activeGroupId, imageVersion);
  return <MyGroupsStore.Provider>
    <GroupPageStore.Provider>
      <Head>
        <title>{ogTitle} - Zekoro</title>
        <meta property="og:title" content={ogTitle} />
        <meta property="og:url" content={activeGroupId ? `https://zekoro.org/My/Groups.aspx?gid=${activeGroupId}` : "https://zekoro.org/My/Groups.aspx"} />
        <meta property="og:type" content="website" />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:secure_url" content={ogImage} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="420" />
        <meta property="og:image:height" content="420" />
        <meta property="og:site_name" content="Zekoro" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="theme-color" content="#1188ff" />
      </Head>
      <MyGroups id={activeGroupId}/>
    </GroupPageStore.Provider>
  </MyGroupsStore.Provider>
}

export async function getServerSideProps(context) {
  const groupId = Number(context.query['gid'] || 0);
  const imageVersion = Date.now();
  context.res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  context.res.setHeader('Pragma', 'no-cache');
  context.res.setHeader('Expires', '0');

  if (!groupId) {
    return {
      props: {
        groupId: null,
        groupName: "Zekoro Group",
        description: "Join the Zekoro community.",
        imageVersion,
      }
    };
  }

  try {
    const info = await getInfo({ groupId });
    return {
      props: {
        groupId,
        groupName: info?.name || "Zekoro Group",
        description: info?.description || "Join the Zekoro community.",
        imageVersion,
      }
    };
  } catch (error) {
    console.error("Error fetching group info in My/Groups.aspx.js", error);
    return {
      props: {
        groupId,
        groupName: "Zekoro Group",
        description: "Join the Zekoro community.",
        imageVersion,
      }
    };
  }
}

export default MyGroupsPage;
