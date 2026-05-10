import PublicLanding from "../components/publicLanding";

const LoginPage = () => {
    return <PublicLanding />;
}

export const getServerSideProps = async () => {
    return {
        props: {
            disableWebsiteTheming: true,
            title: "Zekoro",
        },
    };
};

export default LoginPage;
