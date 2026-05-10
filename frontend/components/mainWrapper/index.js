import React from "react";
import { createUseStyles } from "react-jss"
import FeedbackStore from "../../stores/feedback";

const useStyles = createUseStyles({
  main: props => ({
    minHeight: '95vh',
    paddingTop: props.disableTopPadding ? 0 : '12px',
  }),
  display: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  fallback: {
    padding: '20px',
    color: '#222',
  }
})

const MainWrapper = ({ mainFlex, disableTopPadding, children }) => {
  const s = useStyles({ disableTopPadding });
  const { feedbacks } = FeedbackStore.useContainer();
  const hasRenderableChildren = React.Children.count(children) > 0;
  
  return <div className={`${s.main} ${mainFlex ? s.display : null}`}>
    { feedbacks.map(({feedback, type, visible}) => {
      return <div className={`alert-pjx ${type === 0 ? 'alert-success' : type === 1 ? 'alert-loading' : 'alert-warning'} ${visible ? 'on' : undefined}`}>
        <span className="alert-text">{feedback || ''}</span>
      </div>
    })}
    {hasRenderableChildren ? children : <div className={s.fallback}>This page did not load correctly. Please refresh.</div>}
  </div>
}

export default MainWrapper;
