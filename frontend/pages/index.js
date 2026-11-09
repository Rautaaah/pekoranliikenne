import PublicLanding from "../components/publicLanding";

const IndexPage = () => {
  return <PublicLanding />;
}

export const getServerSideProps = async () => {
  return {
    props: {
      disableWebsiteTheming: true,
      title: "Sign Up - Sansy",
    },
  };
};

export default IndexPage;
