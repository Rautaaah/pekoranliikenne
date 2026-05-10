import CoinflipPage from "../../components/zekomonsPage/coinflip";

const Page = () => <CoinflipPage />;

export const getServerSideProps = async () => ({
  redirect: {
    destination: "/zekomons",
    permanent: false,
  },
});

export default Page;
