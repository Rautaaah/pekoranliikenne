import ZekomonsLeaderboardPage from "../../components/zekomonsPage/leaderboard";

const Page = () => <ZekomonsLeaderboardPage />;

export const getStaticProps = () => ({
  props: {
    title: "Zekomons - Leaderboard",
    disableWebsiteTheming: true,
  },
});

export default Page;
