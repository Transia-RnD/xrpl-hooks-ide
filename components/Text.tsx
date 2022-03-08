import { styled } from "../stitches.config";

const Text = styled("span", {
  fontFamily: "$body",
  lineHeight: "$body",
  color: "$text",
  variants: {
    small: {
      true: {
        fontSize: '$xs'
      }
    },
    muted: {
      true: {
        color: '$mauve9'
      }
    },
    monospace: {
      true: {
        fontFamily: '$monospace'
      }
    }
  }
});

export default Text;
