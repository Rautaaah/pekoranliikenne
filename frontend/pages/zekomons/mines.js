import MinesPage from "../../components/zekomonsPage/mines";

const Page = () => <MinesPage />;

export const getServerSideProps = async () => ({
  redirect: {
    destination: "/zekomons",
    permanent: false,
  },
});

export default Page;
